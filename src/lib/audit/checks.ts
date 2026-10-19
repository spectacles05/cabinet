// Deterministic audit checks over user-confirmed policy records and their stored document text.
// Each finding leads with the issue in a few words, says one sentence by default, keeps the longer
// reasoning for "Why?", and carries the one action that helps resolve it.
import { normaliseForMatch } from "@/lib/evidence/verify";
import { EXCLUSION_TRIGGER, INCLUSION_TRIGGER, sentenceClauses } from "@/lib/extraction/rules";
import { daysUntil, formatDate } from "@/lib/format";
import type { PolicyWithDetails } from "@/lib/policies";
import type { RetrievedChunk } from "@/lib/qa/types";
import type { Finding, FindingEvidence } from "./types";

export const RENEWAL_WINDOW_DAYS = 30;

export function policyName(p: PolicyWithDetails): string {
  return p.display_name ?? p.insurer ?? `${p.policy_type} policy`;
}

function slug(s: string): string {
  return normaliseForMatch(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

const stripParens = (s: string) => s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

// Names as people say them: "Personal Possessions (away from home) extension — covers listed items…"
// becomes "Personal Possessions extension"; "Gadget Insurance — Meridian Account Plus benefit" becomes "Gadget Insurance".
const shortName = (s: string) => stripParens(s).split(/\s[—–-]\s|[:;]|\.\s/)[0].trim().slice(0, 60);
const shortPolicyName = (p: PolicyWithDetails) => p.reviewed?.extras?.nickname || policyName(p).split(/\s[—–-]\s/)[0];

function docEvidence(p: PolicyWithDetails, ev: { page: number | null; quote: string | null; verified: boolean } | null | undefined): FindingEvidence | null {
  if (!ev?.verified || !ev.quote) return null;
  return { policy_id: p.id, policy_name: policyName(p), document_id: p.documentId, page: ev.page, quote: ev.quote, source: "document" };
}

function isoMinusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ───────────── renewals (only established dates; shown in Notifications, not Review) ─────────────

export function renewalFindings(policies: PolicyWithDetails[], today: Date): Finding[] {
  const out: Finding[] = [];
  for (const p of policies) {
    const kind = p.renewal_date ? "renewal" : p.end_date ? "end" : null;
    const date = p.renewal_date ?? p.end_date;
    if (!kind || !date) continue;
    const days = daysUntil(date, today);
    if (days < 0 || days > RENEWAL_WINDOW_DAYS) continue;
    const field = p.reviewed?.fields[kind === "renewal" ? "renewal_date" : "end_date"];
    const evidence =
      docEvidence(p, field?.evidence) ??
      ({ policy_id: p.id, policy_name: policyName(p), document_id: p.documentId, page: null, quote: null, source: "user_confirmed" } as FindingEvidence);
    const when = days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`;
    out.push({
      type: "renewal_due",
      fingerprint: `renewal:${p.id}:${date}`,
      title: `${shortPolicyName(p)} ${kind === "renewal" ? "renews" : "ends"} ${when} (${formatDate(date)})`,
      explanation:
        kind === "renewal"
          ? `Check whether it renews automatically and that the cover still fits before ${formatDate(date)}.`
          : `If you still need this cover, arrange a replacement before ${formatDate(date)}.`,
      detail: null,
      certainty: "confirmed",
      action: { kind: "ask", policy_id: p.id, question: "Does this policy renew automatically?" },
      priority: days <= 7 ? "high" : "medium",
      evidence: [evidence],
      due_date: days > 7 ? isoMinusDays(date, 7) : date,
      policy_ids: [p.id],
    });
  }
  return out;
}

// ───────────── documents referenced but not added ─────────────

// What the policy calls the missing document: its reference (e.g. "PP1" in "Endorsement Schedule PP1"),
// or, when it gives none, the add-on's own name.
function referenceKeys(text: string, fallbackName?: string): string[] {
  const codes = [...new Set(text.match(/\b[A-Z]{1,4}\d{1,3}[A-Z]?\b/g) ?? [])];
  const keys = codes.length ? codes : fallbackName ? [fallbackName] : [];
  return keys.map((k) => normaliseForMatch(k)).filter((k) => k.length >= 3);
}

/** The text of documents the user added to each policy after it was read (anything but its main document). */
function addedDocumentText(policies: PolicyWithDetails[], chunks: RetrievedChunk[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of policies) {
    const text = chunks.filter((c) => c.policy_id === p.id && c.document_id !== p.documentId).map((c) => c.text).join("\n");
    if (text) out.set(p.id, normaliseForMatch(text));
  }
  return out;
}

const mentions = (text: string | undefined, keys: string[]) =>
  Boolean(text) && keys.some((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text!));

/**
 * Documents a policy refers to but that haven't been added. A document the user has since added to the
 * policy counts as supplied when it names the same reference, so the note goes once the right one is in.
 */
export function missingInformationFindings(policies: PolicyWithDetails[], chunks: RetrievedChunk[] = []): Finding[] {
  const added = addedDocumentText(policies, chunks);
  const out: Finding[] = [];
  for (const p of policies) {
    const r = p.reviewed;
    if (!r) continue;
    const supplied = (text: string, name?: string) => mentions(added.get(p.id), referenceKeys(text, name));
    const missingExt = r.optional_extensions.filter(
      (e) =>
        e.status === "referenced_not_provided" &&
        !supplied(`${e.name} ${e.evidence.quote ?? ""}`, stripParens(shortName(e.name)).replace(/\b(extension|endorsement|cover|add-?on)\b/gi, "").trim()),
    );
    // The wording of an add-on that wasn't bought isn't needed, so it isn't a missing document.
    const notBought = r.optional_extensions
      .filter((e) => e.status === "not_purchased")
      .map((e) => normaliseForMatch(stripParens(e.name)))
      .filter((n) => n.length >= 6);
    const needed = r.missing_information
      .filter((m) => !notBought.some((n) => normaliseForMatch(m.description).includes(n)))
      .filter((m) => !supplied(`${m.description} ${m.evidence.quote ?? ""}`));
    const items = [
      ...missingExt.map((e) => ({ text: `${shortName(e.name)}: its schedule isn't in the uploaded documents`, ev: e.evidence })),
      ...needed.map((m) => ({ text: m.description, ev: m.evidence })),
    ];
    if (items.length === 0) continue;
    const evidence: FindingEvidence[] = [];
    for (const i of items) {
      const e = docEvidence(p, i.ev);
      if (e && !evidence.some((x) => x.page === e.page && x.quote === e.quote)) evidence.push(e);
    }
    if (evidence.length === 0) continue; // never flag without pointing at the wording
    const names = [
      ...new Set(missingExt.map((e) => shortName(e.name)).map((n) => (/\b(extension|endorsement|cover|add-?on|option)\b/i.test(n) ? n : `${n} cover`))),
    ];
    out.push({
      type: "missing_information",
      fingerprint: `missing:${p.id}`,
      title: "A document is missing",
      explanation: names.length ? `Your ${names.join(" and ")} can't be checked yet.` : "Part of this policy can't be checked yet.",
      detail: `${
        names.length ? "" : `It refers to: ${items[0].text}. `
      }Until it's added, that part of your cover can't be checked. This doesn't mean you're uninsured.`,
      certainty: "unverified",
      action: { kind: "add_document", policy_id: p.id },
      priority: "medium",
      evidence,
      due_date: null,
      policy_ids: [p.id],
    });
  }
  return out;
}

// ───────────── exclusions that apply because an add-on wasn't bought ─────────────

// Missing cover only matters if you'd need it: ask one plain question first.
const RELEVANCE: [RegExp, string][] = [
  [/winter|ski|snow/i, "Do you ski or snowboard?"],
  [/gadget|electronic/i, "Do you take gadgets like a phone or laptop on trips?"],
  [/cruise/i, "Do you go on cruises?"],
  [/golf/i, "Do you play golf?"],
  [/business|work/i, "Do you travel for work?"],
  [/hazard|adventure|extreme|sport/i, "Do you do adventure sports?"],
  [/bicycle|bike|cycl/i, "Do you own a bike?"],
  [/possessions|away from home/i, "Do you take valuables out with you?"],
];
export function relevanceQuestion(topic: string): string {
  return RELEVANCE.find(([re]) => re.test(topic))?.[1] ?? `Would you need ${topic.toLowerCase()} cover?`;
}

export function addOnExclusionFindings(policies: PolicyWithDetails[]): Finding[] {
  const out: Finding[] = [];
  for (const p of policies) {
    const r = p.reviewed;
    if (!r) continue;
    for (const ext of r.optional_extensions.filter((e) => e.status === "not_purchased")) {
      const name = normaliseForMatch(stripParens(ext.name));
      if (name.length < 6) continue;
      const exclusion = r.exclusions.find(
        (x) => x.evidence.verified && (normaliseForMatch(x.evidence.quote ?? "").includes(name) || normaliseForMatch(x.summary).includes(name)),
      );
      if (!exclusion) continue;
      const extEv = docEvidence(p, ext.evidence);
      const exEv = docEvidence(p, exclusion.evidence);
      if (!exEv) continue;
      const addOn = shortName(ext.name);
      const topic = addOn.replace(/\b(endorsement|extension|add-?on|cover|option)\b/gi, "").replace(/\s+/g, " ").trim() || addOn;
      out.push({
        type: "exclusion",
        fingerprint: `exclusion:${p.id}:addon:${slug(ext.name)}`,
        title: `No ${topic.toLowerCase()} cover`,
        explanation: `You didn't buy the ${addOn}.`,
        detail: `Your schedule shows the ${addOn} as not purchased, and the policy excludes claims that depend on it. If you plan to do this, ask ${p.insurer ?? "your insurer"} about adding it before you need it.`,
        certainty: "confirmed",
        action: { kind: "contact_insurer", policy_id: p.id, topic: addOn },
        relevance_question: relevanceQuestion(topic),
        priority: "medium",
        evidence: [exEv, ...(extEv ? [extEv] : [])],
        due_date: null,
        policy_ids: [p.id],
      });
    }
  }
  return out;
}

// ───────────── possible duplicate cover (positive evidence on BOTH policies) ─────────────

const ITEMS = [
  { key: "laptop", label: "laptop", terms: ["laptop", "macbook", "notebook computer"] },
  { key: "phone", label: "phone", terms: ["smartphone", "mobile phone"] },
  { key: "tablet", label: "tablet", terms: ["tablet", "ipad"] },
  { key: "bicycle", label: "bicycle", terms: ["bicycle"] },
  { key: "camera", label: "camera", terms: ["camera"] },
  { key: "jewellery", label: "jewellery", terms: ["jewellery", "jewelry"] },
];

const NAMED_ITEM = /\b(registered|insured|specified|listed)\s+(gadget|item|items|device|possession)s?\b/i;
const CONTRIBUTION = /\bother insurance\b|\bproportionate share\b|\brateable\b/i;

type Sentence = { chunk: RetrievedChunk; text: string; norm: string };

function sentencesByPolicy(chunks: RetrievedChunk[]): Map<string, Sentence[]> {
  const map = new Map<string, Sentence[]>();
  for (const c of chunks) {
    if (!c.policy_id) continue;
    const list = map.get(c.policy_id) ?? [];
    for (const s of sentenceClauses(c.text, c.page_number)) {
      if (s.text.length < 12) continue;
      list.push({ chunk: c, text: s.text, norm: normaliseForMatch(s.text) });
    }
    map.set(c.policy_id, list);
  }
  return map;
}

export function overlapFindings(policies: PolicyWithDetails[], chunks: RetrievedChunk[]): Finding[] {
  const byPolicy = sentencesByPolicy(chunks);
  const out: Finding[] = [];
  for (const item of ITEMS) {
    const termRe = new RegExp(`\\b(${item.terms.join("|")})`, "i");
    const hits: { policy: PolicyWithDetails; positive: Sentence; contribution: Sentence | undefined }[] = [];
    for (const p of policies) {
      const sentences = byPolicy.get(p.id) ?? [];
      // Positive evidence: the item is named as insured, or a cover clause names it — never an exclusion.
      const positive = sentences.find(
        (s) => termRe.test(s.text) && !EXCLUSION_TRIGGER.test(s.text) && (INCLUSION_TRIGGER.test(s.text) || NAMED_ITEM.test(s.text)),
      );
      // Quote the operative sentence ("...only pay our proportionate share"), not a clause title.
      const contribution =
        sentences.find((s) => /proportionate share|rateable/i.test(s.text)) ?? sentences.find((s) => CONTRIBUTION.test(s.text) && s.text.length > 30);
      if (positive) hits.push({ policy: p, positive, contribution });
    }
    if (hits.length < 2) continue;
    const ev = (p: PolicyWithDetails, s: Sentence): FindingEvidence => ({
      policy_id: p.id,
      policy_name: policyName(p),
      document_id: s.chunk.document_id,
      page: s.chunk.page_number,
      quote: s.text,
      source: "document",
    });
    const allContribution = hits.every((h) => h.contribution);
    out.push({
      type: "possible_overlap",
      fingerprint: `overlap:${item.key}:${hits.map((h) => h.policy.id).sort().join("+")}`,
      title: `Your ${item.label} may have double cover`,
      explanation: hits.length === 2 ? "Both policies seem to cover it." : "Several policies seem to cover it.",
      detail: `The cover isn't necessarily identical (limits and excesses can differ), so this isn't proof you're paying twice.${
        allContribution ? " Both policies say they would only pay a proportionate share if another policy also covers the loss." : ""
      } Check whether you need both, and tell each insurer about the other if you claim.`,
      certainty: "possible",
      action: { kind: "compare" },
      priority: "medium",
      evidence: hits.flatMap((h) => [ev(h.policy, h.positive), ...(h.contribution ? [ev(h.policy, h.contribution)] : [])]),
      due_date: null,
      policy_ids: hits.map((h) => h.policy.id),
    });
  }
  return out;
}

// ───────────── material exclusions (rule-based selection; Claude can replace this) ─────────────

// Exclusions first-time policyholders often miss, each with a short, issue-led title, one plain sentence
// (the exact wording stays under "Why?"), and the question someone would naturally ask about it.
const SURPRISING: { re: RegExp; title: string; line: string; question: string }[] = [
  {
    re: /unattended|public place/i,
    title: "Unattended things aren't covered",
    line: "Keep valuables with you or locked away.",
    question: "What happens if I leave something unattended?",
  },
  {
    re: /within \d+ hours/i,
    title: "There's a deadline to report a claim",
    line: "Report it within {hours} hours.",
    question: "How quickly do I need to report a claim?",
  },
  {
    re: /forc(ed|ible)/i,
    title: "Theft needs signs of forced entry",
    line: "Theft without a break-in may be refused.",
    question: "When is theft covered?",
  },
  {
    re: /pre-existing/i,
    title: "Pre-existing conditions are excluded",
    line: "Tell your insurer about any conditions you have.",
    question: "Are pre-existing medical conditions covered?",
  },
  {
    re: /\b(loss of|losing|misplac)/i,
    title: "Losing something isn't covered",
    line: "Only theft or damage may be covered.",
    question: "Am I covered if I lose my phone?",
  },
  {
    re: /away from (your )?home/i,
    title: "Cover stops outside your home",
    line: "Things you take out may not be covered.",
    question: "Are my things covered away from home?",
  },
  {
    re: /alcohol|drugs/i,
    title: "Claims involving alcohol are excluded",
    line: "Drinking can void a claim.",
    question: "Am I covered if I've been drinking?",
  },
  {
    re: /unoccupied/i,
    title: "An empty home isn't covered for long",
    line: "Check the limit before long trips away.",
    question: "What if my home is empty for a while?",
  },
  {
    re: /cosmetic/i,
    title: "Cosmetic damage isn't covered",
    line: "Scratches and dents can't be claimed.",
    question: "Is cosmetic damage covered?",
  },
  {
    re: /deeper than|over \d+cc|without a (qualified|helmet)/i,
    title: "Some activities aren't covered",
    line: "Check before risky sports or trips.",
    question: "Which activities aren't covered?",
  },
];

export type MaterialCandidate = { id: string; policy: PolicyWithDetails; summary: string; page: number | null; quote: string };

export function materialCandidates(policies: PolicyWithDetails[], alreadyCited: Set<string>): MaterialCandidate[] {
  const out: MaterialCandidate[] = [];
  policies.forEach((p, pi) => {
    (p.reviewed?.exclusions ?? []).forEach((x, xi) => {
      if (!x.evidence.verified || !x.evidence.quote) return;
      if (alreadyCited.has(`${p.id}|${normaliseForMatch(x.evidence.quote)}`)) return;
      out.push({ id: `P${pi + 1}-E${xi + 1}`, policy: p, summary: x.summary, page: x.evidence.page, quote: x.evidence.quote });
    });
  });
  return out;
}

export function materialFinding(
  c: MaterialCandidate,
  title: string,
  explanation: string,
  priority: Finding["priority"] = "low",
  more: { detail?: string | null; question?: string } = {},
): Finding {
  return {
    type: "exclusion",
    fingerprint: `exclusion:${c.policy.id}:${slug(c.quote)}`,
    title,
    explanation,
    detail: more.detail ?? null,
    certainty: "possible",
    action: { kind: "ask", policy_id: c.policy.id, question: more.question ?? "When doesn't this policy pay out?" },
    priority,
    evidence: [{ policy_id: c.policy.id, policy_name: policyName(c.policy), document_id: c.policy.documentId, page: c.page, quote: c.quote, source: "document" }],
    due_date: null,
    policy_ids: [c.policy.id],
  };
}

/** Rule-based pick of up to `perPolicy` exclusions per policy that first-time policyholders often miss. */
export function materialExclusionsByRules(candidates: MaterialCandidate[], perPolicy = 1): Finding[] {
  const scored = candidates
    .map((c) => {
      const text = `${c.summary} ${c.quote}`;
      const hits = SURPRISING.filter((s) => s.re.test(text));
      return { c, hits };
    })
    .filter((x) => x.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);
  const count = new Map<string, number>();
  const out: Finding[] = [];
  for (const { c, hits } of scored) {
    const n = count.get(c.policy.id) ?? 0;
    if (n >= perPolicy) continue;
    count.set(c.policy.id, n + 1);
    const hours = `${c.summary} ${c.quote}`.match(/within (\d+) hours/i)?.[1] ?? "a set number of";
    out.push(
      materialFinding(c, hits[0].title, hits[0].line.replace("{hours}", hours), "low", {
        detail: "This is easy to miss. Here's the exact wording, so you know when a claim could be refused.",
        question: hits[0].question,
      }),
    );
  }
  return out;
}

/** Keys of evidence already used by other findings, so material-exclusion findings don't repeat them. */
export function citedKeys(findings: Finding[]): Set<string> {
  return new Set(findings.flatMap((f) => f.evidence.filter((e) => e.quote).map((e) => `${e.policy_id}|${normaliseForMatch(e.quote!)}`)));
}
