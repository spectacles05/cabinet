// Live claims and Your Cover eval: the real Claude reads an incident, checks the policy for it, and picks
// unusual exclusions, on the fictional samples. Every result goes through the same verification as the
// app. All of a policy's passages are passed in (the samples are only 4-6 pages); the app retrieves the
// most relevant ones with Postgres full-text search instead. Costs a few cents. Usage: npm run eval:claims
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { parsePdf } from "@/lib/pdf/parse";
import { chunkPages } from "@/lib/pdf/chunk";
import { extractWithRules } from "@/lib/extraction/rules";
import { verifyExtraction } from "@/lib/extraction/verify-extraction";
import { buildReviewedPolicy, defaultSubmission } from "@/lib/extraction/confirm";
import { getAnthropic } from "@/lib/ai/client";
import { triageWithClaude, validIncidentDate, type TriagePolicy } from "@/lib/claims/triage";
import { assessWithClaude, type AssessPolicy } from "@/lib/claims/assess";
import { verifyAssessment } from "@/lib/claims/verify";
import { remainingQuestions } from "@/lib/claims/questions";
import { selectMaterialWithClaude } from "@/lib/audit/claude-audit";
import { addOnExclusionFindings, citedKeys, materialCandidates, missingInformationFindings, overlapFindings } from "@/lib/audit/checks";
import { formatMoney } from "@/lib/format";
import type { PolicyWithDetails } from "@/lib/policies";
import type { RetrievedChunk } from "@/lib/qa/types";

config({ path: ".env.local", quiet: true });
// Running an eval is an explicit choice to use (and pay for) Live AI, whatever the app is set to.
process.env.CABINET_MODE = "live";

const FILES = ["travel.pdf", "contents.pdf", "gadget.pdf"];
const TODAY = new Date();
const yesterday = new Date(TODAY.getTime() - 86_400_000).toISOString().slice(0, 10);
const cost = (i: number, o: number) => (i * 4 + o * 20) / 1e6; // claude-opus-5-5: $4 / $20 per million tokens

async function main() {
  const policies: PolicyWithDetails[] = [];
  const chunks: RetrievedChunk[] = [];
  for (const file of FILES) {
    const parsed = await parsePdf(new Uint8Array(readFileSync(join("samples", file))));
    const verified = { ...verifyExtraction(extractWithRules(parsed.pages), parsed.pages), engine: "rules" as const };
    const sub = defaultSubmission(verified);
    const reviewed = buildReviewedPolicy(verified, sub, `doc-${file}`, TODAY);
    const f = sub.fields;
    policies.push({
      id: `policy-${file}`,
      policy_type: sub.policy_type,
      insurer: f.insurer as string | null,
      display_name: f.display_name as string | null,
      policy_number_masked: null,
      start_date: f.start_date as string | null,
      end_date: f.end_date as string | null,
      renewal_date: f.renewal_date as string | null,
      premium_amount: f.premium_amount as number | null,
      premium_frequency: f.premium_frequency as string | null,
      currency: f.currency as string | null,
      excess_amount: f.excess_amount as number | null,
      confirmed_at: TODAY.toISOString(),
      reviewed,
      documentId: `doc-${file}`,
    });
    for (const c of chunkPages(parsed.pages)) {
      chunks.push({ id: `${file}#${c.chunkIndex}`, document_id: `doc-${file}`, policy_id: `policy-${file}`, page_number: c.pageNumber, text: c.text });
    }
  }
  const client = await getAnthropic();
  let tokensIn = 0;
  let tokensOut = 0;
  const out: Record<string, unknown> = {};

  // ── 1. A claim: someone broke into the car and took the phone ──
  const description = "Someone smashed my car window yesterday and stole my phone";
  const list: TriagePolicy[] = policies.map((p) => ({
    id: p.id,
    name: p.display_name ?? p.insurer ?? p.policy_type,
    policy_type: p.policy_type,
    insurer: p.insurer,
    addOns: (p.reviewed?.optional_extensions ?? []).map((e) => `${e.name}: ${e.status.replace(/_/g, " ")}`),
  }));
  const t = await triageWithClaude(client, description, list, TODAY);
  tokensIn += t.inputTokens;
  tokensOut += t.outputTokens;
  const triageChecks = {
    incident_type_theft: t.triage.incident_type === "theft",
    picked_gadget_policy: t.triage.policy_id === "policy-gadget.pdf",
    where_vehicle: t.triage.prefilled.where === "vehicle",
    date_is_yesterday: t.triage.prefilled.when === yesterday,
    only_known_policy_ids: [t.triage.policy_id, ...t.triage.alternatives].every((id) => !id || policies.some((p) => p.id === id)),
  };

  const policy = policies.find((p) => p.id === "policy-gadget.pdf")!;
  const ev = policy.reviewed?.fields.excess_amount?.evidence;
  const excess = formatMoney(policy.excess_amount, policy.currency);
  const assessPolicy: AssessPolicy = {
    id: policy.id,
    name: policy.display_name ?? policy.insurer ?? "Gadget policy",
    policy_type: policy.policy_type,
    insurer: policy.insurer,
    documentId: policy.documentId,
    extensions: (policy.reviewed?.optional_extensions ?? []).map((e) => ({ name: e.name, status: e.status, page: e.evidence.page, quote: e.evidence.quote })),
    facts: excess ? [`standard excess ${excess}`] : [],
    excess: excess
      ? { text: `Your excess: ${excess}`, citation: ev?.verified && ev.quote && ev.page ? { document_id: policy.documentId!, page: ev.page, quote: ev.quote } : null }
      : null,
  };
  const answers = { when: yesterday, where: "vehicle" as const, forced_entry: "yes" as const, police: "no" as const, evidence: [] as string[] };
  const policyChunks = chunks.filter((c) => c.policy_id === policy.id);
  const a = await assessWithClaude(client, { description, incident_type: "theft", item: "phone", answers }, policyChunks, assessPolicy);
  tokensIn += a.inputTokens;
  tokensOut += a.outputTokens;
  const checked = verifyAssessment(a.proposed, policyChunks, { incidentDate: validIncidentDate(yesterday, TODAY), engine: "claude", model: a.model });
  const claimChecks = {
    all_questions_answered: remainingQuestions("theft", answers).length === 0,
    verdict_not_overconfident: checked.verdict !== "likely_covered", // a car theft depends on conditions in this policy
    has_confirmed_facts: checked.facts.some((f) => f.certainty === "confirmed"),
    police_deadline_found: checked.deadlines.some((d) => /police/i.test(d.action)),
    every_deadline_cited: checked.deadlines.every((d) => d.citation?.quote),
    no_invented_contacts: checked.contacts.every((c) => c.citation),
    items_removed_by_checker: checked.rejected,
  };
  out.claim = { triage: t.triage, triageChecks, proposed: a.proposed, checked, claimChecks };

  // ── 2. Your Cover: does Claude pick an unusual exclusion, and only from verified ones? ──
  const deterministic = [...missingInformationFindings(policies, chunks), ...addOnExclusionFindings(policies), ...overlapFindings(policies, chunks)];
  const candidates = materialCandidates(policies, citedKeys(deterministic));
  const m = await selectMaterialWithClaude(client, candidates);
  tokensIn += m.inputTokens;
  tokensOut += m.outputTokens;
  const coverChecks = {
    candidates: candidates.length,
    picked: m.findings.length,
    within_limits: m.findings.length <= 2,
    every_pick_is_verified_wording: m.findings.every((f) => candidates.some((c) => f.evidence[0]?.quote === c.quote)),
    titles: m.findings.map((f) => f.title),
  };
  out.cover = { findings: m.findings, coverChecks };

  console.log("\nCLAIM TRIAGE", triageChecks, `(${t.inputTokens}/${t.outputTokens} tokens)`);
  console.log("\nCLAIM CHECK", { verdict: checked.verdict, headline: checked.headline, ...claimChecks }, `(${a.inputTokens}/${a.outputTokens} tokens)`);
  console.log("deadlines:", checked.deadlines.map((d) => `${d.action} (${d.hours}h, p.${d.citation.page})`));
  console.log("facts:", checked.facts.map((f) => `[${f.certainty}] ${f.text}`));
  console.log("\nYOUR COVER", coverChecks, `(${m.inputTokens}/${m.outputTokens} tokens)`);
  console.log(`\nTOKENS: ${tokensIn} in / ${tokensOut} out, about $${cost(tokensIn, tokensOut).toFixed(3)}`);
  mkdirSync(join("private", "eval"), { recursive: true });
  writeFileSync(join("private", "eval", "claims-claude.json"), JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
