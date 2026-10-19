// Claims preparation engine: understanding the incident, the essential questions, the policy check,
// and the verification that keeps anything unverified (quotes, contacts, deadlines, promises) out.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { beforeAll, describe, expect, it } from "vitest";
import { parsePdf } from "@/lib/pdf/parse";
import { chunkPages } from "@/lib/pdf/chunk";
import { extractWithRules } from "@/lib/extraction/rules";
import type { RetrievedChunk } from "@/lib/qa/types";
import { triageWithClaude, triageWithRules, validIncidentDate, type TriagePolicy } from "@/lib/claims/triage";
import { questionsFor, remainingQuestions } from "@/lib/claims/questions";
import { assessWithClaude, assessWithRules, CLAIM_PROMPT, type AssessInput, type AssessPolicy } from "@/lib/claims/assess";
import { dueDate, toProposed, verifyAssessment } from "@/lib/claims/verify";
import type { ProposedAssessment } from "@/lib/claims/types";

const TODAY = new Date("2026-10-15T12:00:00Z");
const FILES = ["travel.pdf", "contents.pdf", "gadget.pdf"] as const;
const chunks: Record<string, RetrievedChunk[]> = {};
const policies: Record<string, AssessPolicy> = {};
const triagePolicies: TriagePolicy[] = [];

beforeAll(async () => {
  for (const file of FILES) {
    const parsed = await parsePdf(new Uint8Array(readFileSync(join(process.cwd(), "samples", file))));
    const ex = extractWithRules(parsed.pages);
    const id = `policy-${file}`;
    policies[file] = {
      id,
      name: ex.fields.display_name.value ?? file,
      policy_type: ex.policy_type,
      insurer: ex.fields.insurer.value,
      documentId: `doc-${file}`,
      extensions: ex.optional_extensions.map((e) => ({ name: e.name, status: e.status, page: e.page, quote: e.quote })),
      facts: [],
      excess: null,
    };
    triagePolicies.push({ id, name: policies[file].name, policy_type: ex.policy_type, insurer: ex.fields.insurer.value, addOns: [] });
    chunks[file] = chunkPages(parsed.pages).map((c) => ({ id: `${file}#${c.chunkIndex}`, document_id: `doc-${file}`, policy_id: id, page_number: c.pageNumber, text: c.text }));
  }
});

const check = (file: (typeof FILES)[number], input: AssessInput, incidentDate: string | null = "2026-10-14") =>
  verifyAssessment(assessWithRules(input, chunks[file], policies[file]), chunks[file], { incidentDate, engine: "rules", model: "rules" });

describe("understanding what happened (rules)", () => {
  it("reads a natural description: what, which item, when, where, and the best policy", () => {
    const t = triageWithRules("My laptop was stolen yesterday from a café", triagePolicies, TODAY);
    expect(t.incident_type).toBe("theft");
    expect(t.item).toBe("laptop");
    expect(t.title).toBe("Stolen laptop");
    expect(t.prefilled).toMatchObject({ when: "2026-10-14", where: "away" });
    expect(t.policy_id).toBe("policy-gadget.pdf");
    expect(t.alternatives).toContain("policy-contents.pdf");
  });
  it("sends trips and medical problems to travel cover", () => {
    expect(triageWithRules("I broke my leg skiing in France and went to hospital", triagePolicies, TODAY)).toMatchObject({ incident_type: "medical", policy_id: "policy-travel.pdf" });
    expect(triageWithRules("The airline lost my suitcase", triagePolicies, TODAY).incident_type).toBe("baggage");
  });
  it("records a break-in only when the description says so", () => {
    expect(triageWithRules("Someone broke in to my flat and took my bike", triagePolicies, TODAY).prefilled).toMatchObject({ forced_entry: "yes", where: "home" });
    expect(triageWithRules("My bike was stolen from my flat", triagePolicies, TODAY).prefilled.forced_entry).toBeUndefined();
  });
  it("never accepts a future or implausible date", () => {
    expect(validIncidentDate("2026-10-20", TODAY)).toBeNull();
    expect(validIncidentDate("2019-01-01", TODAY)).toBeNull();
    expect(validIncidentDate("2026-10-01", TODAY)).toBe("2026-10-01");
  });
});

describe("only the essential questions", () => {
  it("asks about a break-in at home, and about leaving it unattended when out", () => {
    expect(questionsFor("theft", { where: "home" }).map((q) => q.id)).toEqual(["when", "where", "forced_entry", "police", "evidence"]);
    expect(questionsFor("theft", { where: "away" }).map((q) => q.id)).toEqual(["when", "where", "unattended", "police", "evidence"]);
  });
  it("skips what the description already answered, and never asks more than five", () => {
    expect(remainingQuestions("theft", { when: "2026-10-14", where: "away" }).map((q) => q.id)).toEqual(["unattended", "police", "evidence"]);
    for (const type of ["theft", "loss", "accidental_damage", "medical", "travel_disruption", "baggage", "other"] as const) {
      expect(questionsFor(type, { where: "home" }).length).toBeLessThanOrEqual(5);
    }
  });
});

describe("checking the policy (rules) on the fictional samples", () => {
  it("phone stolen from a car: conditional, with the 48-hour police deadline and a cited checklist", () => {
    const a = check("gadget.pdf", { description: "My phone was stolen from my car", incident_type: "theft", item: "phone", answers: { when: "2026-10-14", where: "vehicle", forced_entry: "yes", police: "no", evidence: [] } });
    expect(a.verdict).toBe("conditional");
    expect(a.deadlines[0]).toMatchObject({ action: "Report it to the police", hours: 48, due_date: "2026-10-16" });
    expect(a.deadlines[0].citation?.page).toBe(3);
    const police = a.checklist.find((c) => c.label === "Police crime reference number");
    expect(police).toMatchObject({ source: "policy", done: false });
    expect(a.rejected).toBe(0);
  });
  it("laptop stolen from a café on contents cover: uncertain, because the PP1 schedule is missing", () => {
    const a = check("contents.pdf", { description: "My laptop was stolen from a café", incident_type: "theft", item: "laptop", answers: { when: "2026-10-14", where: "away", unattended: "no", police: "yes", evidence: ["police_ref"] } });
    expect(a.verdict).toBe("unclear");
    expect(a.facts.some((f) => f.certainty === "uncertain")).toBe(true);
    expect(a.deadlines.some((d) => d.hours === 24)).toBe(true);
    expect(a.checklist.find((c) => c.label === "Police crime reference number")?.done).toBe(true);
  });
  it("without a date, deadlines are shown without a due date (missing information isn't guessed)", () => {
    const a = check("gadget.pdf", { description: "My phone was stolen", incident_type: "theft", item: "phone", answers: { when: "unknown", where: "away", unattended: "no", police: "no", evidence: [] } }, null);
    expect(a.deadlines[0].due_date).toBeNull();
  });
  it("never invents a contact: the samples have no claims number, so none is shown", () => {
    for (const file of FILES) {
      const a = check(file, { description: "It was stolen", incident_type: "theft", item: null, answers: { when: "2026-10-14", where: "home", forced_entry: "yes", police: "yes", evidence: [] } });
      expect(a.contacts).toEqual([]);
    }
  });
});

describe("verification keeps out anything that isn't in the user's own wording", () => {
  const gadget = () => chunks["gadget.pdf"];
  const page3 = () => gadget().find((c) => c.page_number === 3 && c.text.includes("48 hours"))!;
  const base = (over: Partial<ProposedAssessment>): ProposedAssessment => ({
    verdict: "conditional",
    headline: "Covered if you report it in time.",
    facts: [],
    deadlines: [],
    contacts: [],
    checklist: [],
    next_steps: [],
    ...over,
  });
  const real = "2.5 Any claim where the theft was not reported to the police within 48 hours.";
  const cite = (quote: string, page = 3) => ({ document_id: "doc-gadget.pdf", page, quote });
  const verify = (p: ProposedAssessment) => verifyAssessment(p, gadget(), { incidentDate: "2026-10-14", engine: "claude", model: "m" });

  it("drops facts with made-up quotes, and keeps verified ones as confirmed", () => {
    expect(page3()).toBeTruthy();
    const a = verify(
      base({
        facts: [
          { kind: "exclusion", text: "Theft not reported within 48 hours isn't paid.", certain: true, citation: cite(real) },
          { kind: "cover", text: "Theft is covered everywhere, always.", certain: true, citation: cite("We cover every theft without conditions.") },
        ],
      }),
    );
    expect(a.facts).toHaveLength(1);
    expect(a.facts[0].certainty).toBe("confirmed");
    expect(a.rejected).toBe(1);
  });

  it("an uncited statement survives only as an uncertainty", () => {
    const a = verify(
      base({
        facts: [
          { kind: "cover", text: "Your phone is covered up to £2,000.", certain: true, citation: null },
          { kind: "condition", text: "Whether a replacement was registered can't be confirmed.", certain: true, citation: null },
        ],
      }),
    );
    expect(a.facts.map((f) => [f.text, f.certainty])).toEqual([["Whether a replacement was registered can't be confirmed.", "uncertain"]]);
  });

  it("downgrades the verdict when nothing confirmed supports it, and never lets a promise through", () => {
    expect(verify(base({ verdict: "likely_covered", headline: "Yes, you're covered." })).verdict).toBe("unclear");
    const promised = verify(
      base({ verdict: "conditional", headline: "Your claim is guaranteed to be paid.", facts: [{ kind: "exclusion", text: "Report within 48 hours.", certain: true, citation: cite(real) }] }),
    );
    expect(promised.verdict).toBe("conditional");
    expect(promised.headline).toBe("This may be covered, but conditions apply.");
  });

  it("keeps a deadline only when the quote states that time limit, and works out the due day", () => {
    const a = verify(
      base({
        deadlines: [
          { action: "Report it to the police", amount: 48, unit: "hours", citation: cite(real) },
          { action: "Tell Orbit", amount: 7, unit: "days", citation: cite(real) },
        ],
      }),
    );
    expect(a.deadlines).toEqual([{ action: "Report it to the police", hours: 48, due_date: "2026-10-16", citation: cite(real) }]);
    expect(dueDate("2026-10-14", 24)).toBe("2026-10-15");
    expect(dueDate(null, 24)).toBeNull();
  });

  it("drops contact details that aren't in the quoted wording, wherever they appear", () => {
    const a = verify(
      base({
        contacts: [{ label: "Claims line", value: "0800 123 4567", citation: cite(real) }],
        next_steps: ["Call Orbit on 0800 123 4567 to claim.", "Report it to the police within 48 hours."],
        checklist: [{ label: "Email claims@orbit.example", required_by_policy: false, already_done: false, citation: null }],
      }),
    );
    expect(a.contacts).toEqual([]);
    expect(a.next_steps).toEqual(["Report it to the police within 48 hours."]);
    expect(a.checklist).toEqual([]);
  });

  it("'required by your policy' needs a verified quote; otherwise it's only a suggestion", () => {
    const a = verify(
      base({
        checklist: [
          { label: "Police crime reference number", required_by_policy: true, already_done: false, citation: cite(real) },
          { label: "Receipt", required_by_policy: true, already_done: true, citation: cite("You must send us the original receipt.") },
        ],
      }),
    );
    expect(a.checklist.map((c) => [c.label, c.source, c.done])).toEqual([
      ["Police crime reference number", "policy", false],
      ["Receipt", "suggested", true],
    ]);
  });

  it("re-verifies the same way before saving (days deadlines included)", () => {
    const register = gadget().find((c) => c.text.includes("within 30 days"))!;
    const quote = "3.3 You must register any replacement gadget with us within 30 days for it to be covered.";
    const first = verify(
      base({
        facts: [{ kind: "exclusion", text: "Late police reports aren't paid.", certain: true, citation: cite(real) }],
        deadlines: [{ action: "Register a replacement", amount: 30, unit: "days", citation: cite(quote, register.page_number) }],
      }),
    );
    expect(first.deadlines).toHaveLength(1);
    const again = verify(toProposed(first));
    expect(again.deadlines).toEqual(first.deadlines);
    expect(again.facts).toEqual(first.facts);
    expect(again.rejected).toBe(0);
  });
});

// ── Live AI path with a stand-in client (no network) ──

function stand(output: Record<string, unknown>, captured: { content?: string; system?: string } = {}): Anthropic {
  return {
    beta: {
      messages: {
        parse: async (params: { system: string; messages: { content: string }[] }) => {
          captured.content = params.messages[0].content;
          captured.system = params.system;
          return { stop_reason: "end_turn", parsed_output: output, model: "stand-in", usage: { input_tokens: 1, output_tokens: 1 } };
        },
      },
    },
  } as unknown as Anthropic;
}

describe("live AI claim steps (stand-in client)", () => {
  it("triage keeps only the user's own policies and plausible dates", async () => {
    const r = await triageWithClaude(
      stand({
        incident_type: "theft",
        item: "Laptop",
        title: "Stolen laptop",
        when: "2027-01-01",
        where: "away",
        forced_entry: "unknown",
        unattended: "no",
        police: "unknown",
        policy_ids: ["someone-elses-policy", "policy-contents.pdf"],
      }),
      "my laptop got nicked at the library",
      triagePolicies,
      TODAY,
    );
    expect(r.triage.policy_id).toBe("policy-contents.pdf");
    expect(r.triage.alternatives).not.toContain("someone-elses-policy");
    expect(r.triage.prefilled).toEqual({ where: "away", unattended: "no" });
  });

  it("the policy check maps sources to pages, and verification removes what doesn't match", async () => {
    const travel = chunks["travel.pdf"];
    const winter = travel.findIndex((c) => c.text.includes("4.7 Winter sports"));
    const captured: { content?: string; system?: string } = {};
    const r = await assessWithClaude(
      stand(
        {
          verdict: "likely_not_covered",
          headline: "No, skiing injuries aren't covered.",
          facts: [
            { kind: "exclusion", text: "Winter sports claims are excluded without the endorsement.", certain: true, source: `S${winter + 1}`, quote: "We will not pay any claim under any section arising from you taking part in winter sports" },
            { kind: "cover", text: "Ski injuries are covered up to £1m.", certain: true, source: "S99", quote: "ski injuries are covered" },
          ],
          deadlines: [],
          contacts: [{ label: "Emergency line", value: "+44 20 7946 0000", source: `S${winter + 1}`, quote: "Call +44 20 7946 0000" }],
          checklist: [{ label: "Medical report", required_by_policy: false, already_done: false, source: "", quote: "" }],
          next_steps: ["Ask Harbourlight about adding the Winter Sports Endorsement."],
        },
        captured,
      ),
      { description: "I broke my leg skiing", incident_type: "medical", item: null, answers: { when: "2026-10-14", assistance: "yes", evidence: ["medical_report"] } },
      travel,
      policies["travel.pdf"],
    );
    const a = verifyAssessment(r.proposed, travel, { incidentDate: "2026-10-14", engine: "claude", model: r.model });
    expect(a.verdict).toBe("likely_not_covered");
    expect(a.facts).toHaveLength(1);
    expect(a.facts[0].citation?.page).toBe(4);
    expect(a.contacts).toEqual([]);
    expect(a.rejected).toBe(2);
    expect(captured.content).toMatch(/<description>\nI broke my leg skiing\n<\/description>/);
    expect(captured.content).toMatch(/evidence: Medical report or bills/);
    expect(CLAIM_PROMPT).toMatch(/never submits claims or contacts insurers/);
    expect(CLAIM_PROMPT).toMatch(/Never invent or recall contact details/);
  });
});
