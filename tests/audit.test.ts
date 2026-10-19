// Audit checks on the fictional samples (real parser + rule-based extraction + confirm step),
// compared with samples/ground-truth.json "expectedInsights".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parsePdf } from "@/lib/pdf/parse";
import { chunkPages } from "@/lib/pdf/chunk";
import { extractWithRules } from "@/lib/extraction/rules";
import { verifyExtraction } from "@/lib/extraction/verify-extraction";
import { buildReviewedPolicy } from "@/lib/extraction/confirm";
import { FIELD_KEYS, ReviewSubmission } from "@/lib/extraction/schema";
import {
  addOnExclusionFindings,
  citedKeys,
  materialCandidates,
  materialExclusionsByRules,
  missingInformationFindings,
  overlapFindings,
  renewalFindings,
} from "@/lib/audit/checks";
import type { PolicyWithDetails } from "@/lib/policies";
import type { RetrievedChunk } from "@/lib/qa/types";

const FILES = ["travel.pdf", "contents.pdf", "gadget.pdf"];
const TODAY = new Date("2026-10-14T09:00:00Z");
const policies: PolicyWithDetails[] = [];
const chunks: RetrievedChunk[] = [];

beforeAll(async () => {
  for (const file of FILES) {
    const parsed = await parsePdf(new Uint8Array(readFileSync(join(process.cwd(), "samples", file))));
    const verified = verifyExtraction(extractWithRules(parsed.pages), parsed.pages);
    const fields = Object.fromEntries(FIELD_KEYS.map((k) => [k, verified.fields[k].value])) as ReviewSubmission["fields"];
    const all = (n: number) => Array.from({ length: n }, (_, i) => i);
    const submission = ReviewSubmission.parse({
      policy_type: verified.policy_type,
      fields,
      keep: {
        limits: all(verified.limits.length),
        inclusions: all(verified.inclusions.length),
        exclusions: all(verified.exclusions.length),
        conditions: all(verified.conditions.length),
        optional_extensions: all(verified.optional_extensions.length),
      },
    });
    const id = `policy-${file}`;
    const reviewed = buildReviewedPolicy(verified, submission, `doc-${file}`, TODAY);
    policies.push({
      id,
      policy_type: verified.policy_type,
      insurer: fields.insurer as string | null,
      display_name: fields.display_name as string | null,
      policy_number_masked: null,
      start_date: fields.start_date as string | null,
      end_date: fields.end_date as string | null,
      renewal_date: fields.renewal_date as string | null,
      premium_amount: fields.premium_amount as number | null,
      premium_frequency: fields.premium_frequency as string | null,
      currency: fields.currency as string | null,
      excess_amount: fields.excess_amount as number | null,
      confirmed_at: TODAY.toISOString(),
      reviewed,
      documentId: `doc-${file}`,
    });
    for (const c of chunkPages(parsed.pages)) {
      chunks.push({ id: `${file}#${c.chunkIndex}`, document_id: `doc-${file}`, policy_id: id, page_number: c.pageNumber, text: c.text });
    }
  }
});

const byFile = (f: string) => `policy-${f}`;

describe("audit checks", () => {
  it("flags the travel renewal 20 days away, citing the schedule (p1)", () => {
    const f = renewalFindings(policies, TODAY);
    expect(f).toHaveLength(1);
    expect(f[0].policy_ids).toEqual([byFile("travel.pdf")]);
    expect(f[0].title).toMatch(/renews in 20 days/);
    expect(f[0].evidence[0]).toMatchObject({ page: 1, source: "document" });
    expect(f[0].due_date).toBe("2026-10-27");
  });

  it("does not flag renewals outside the window or without an established date", () => {
    expect(renewalFindings(policies, new Date("2026-08-01T00:00:00Z"))).toHaveLength(0);
    expect(renewalFindings(policies.filter((p) => !p.renewal_date && !p.end_date), TODAY)).toHaveLength(0);
  });

  it("flags the missing PP1 schedule on the contents policy as 'unable to verify', not 'uninsured'", () => {
    const f = missingInformationFindings(policies);
    expect(f.map((x) => x.policy_ids[0])).toEqual([byFile("contents.pdf")]);
    expect(f[0].title).toBe("A document is missing");
    expect(f[0].explanation).toBe("Your Personal Possessions cover can't be checked yet.");
    expect(f[0].certainty).toBe("unverified");
    expect(f[0].action).toEqual({ kind: "add_document", policy_id: byFile("contents.pdf") });
    expect(f[0].detail).toMatch(/doesn't mean you're uninsured/);
    expect(f[0].evidence.every((e) => e.page === 1 && e.quote)).toBe(true);
  });

  it("drops the missing-document note once a document naming the same reference (PP1) is added to the policy", () => {
    const contents = policies.filter((p) => p.id === byFile("contents.pdf"));
    const schedule: RetrievedChunk = {
      id: "pp1#0",
      document_id: "doc-pp1",
      policy_id: byFile("contents.pdf"),
      page_number: 1,
      text: "Endorsement Schedule PP1\nPersonal Possessions (away from home): Laptop, value GBP 900.",
    };
    expect(missingInformationFindings(contents, [...chunks, schedule])).toHaveLength(0);
    // A document that doesn't name it leaves the note where it is.
    const letter: RetrievedChunk = { ...schedule, id: "letter#0", document_id: "doc-letter", text: "Welcome to your new policy. Thank you for choosing us." };
    expect(missingInformationFindings(contents, [...chunks, letter])).toHaveLength(1);
    // The policy's own wording (which is where PP1 is said to be missing) never counts.
    expect(missingInformationFindings(contents, chunks)).toHaveLength(1);
  });

  it("flags winter sports as excluded because the endorsement wasn't purchased (p4 + p1)", () => {
    const f = addOnExclusionFindings(policies);
    expect(f).toHaveLength(1);
    expect(f[0].title).toBe("No winter sports cover");
    expect(f[0].certainty).toBe("confirmed");
    expect(f[0].action).toMatchObject({ kind: "contact_insurer", topic: "Winter Sports Endorsement" });
    expect(f[0].evidence.map((e) => e.page).sort()).toEqual([1, 4]);
  });

  it("flags a POSSIBLE laptop overlap between contents and gadget, with positive evidence on both", () => {
    const f = overlapFindings(policies, chunks);
    expect(f).toHaveLength(1);
    expect(f[0].title).toBe("Your laptop may have double cover");
    expect(f[0].explanation).not.toMatch(/—/);
    expect(f[0].certainty).toBe("possible");
    expect(f[0].action).toEqual({ kind: "compare" });
    expect([...f[0].policy_ids].sort()).toEqual([byFile("contents.pdf"), byFile("gadget.pdf")].sort());
    const pages = f[0].evidence.map((e) => `${e.policy_id}:${e.page}`);
    expect(pages).toContain(`${byFile("contents.pdf")}:2`);
    expect(pages).toContain(`${byFile("gadget.pdf")}:1`);
    expect(f[0].detail).toMatch(/isn't proof/);
    expect(f[0].detail).toMatch(/proportionate share/);
  });

  it("does not report overlap from a single policy or from exclusion wording", () => {
    expect(overlapFindings(policies.filter((p) => p.id === byFile("gadget.pdf")), chunks)).toHaveLength(0);
  });

  it("rule-based material exclusions cite verified wording and skip evidence already used", () => {
    const base = [...renewalFindings(policies, TODAY), ...missingInformationFindings(policies), ...addOnExclusionFindings(policies)];
    const used = citedKeys(base);
    const f = materialExclusionsByRules(materialCandidates(policies, used));
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) {
      expect(x.evidence[0].quote).toBeTruthy();
      expect(x.explanation).toMatch(/^[A-Z][^…]{15,80}\.$/);
      expect(used.has(`${x.evidence[0].policy_id}|${x.evidence[0].quote!.toLowerCase()}`)).toBe(false);
    }
    const perPolicy = new Map<string, number>();
    f.forEach((x) => perPolicy.set(x.policy_ids[0], (perPolicy.get(x.policy_ids[0]) ?? 0) + 1));
    expect(Math.max(...perPolicy.values())).toBe(1);
  });

  it("all fingerprints are unique and stable across runs", () => {
    const run = () =>
      [...renewalFindings(policies, TODAY), ...missingInformationFindings(policies), ...addOnExclusionFindings(policies), ...overlapFindings(policies, chunks)].map(
        (f) => f.fingerprint,
      );
    const a = run();
    expect(new Set(a).size).toBe(a.length);
    expect(run()).toEqual(a);
  });
});
