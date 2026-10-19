import { describe, expect, it } from "vitest";
import { buildReviewedPolicy, defaultSubmission } from "@/lib/extraction/confirm";
import { verifyExtraction } from "@/lib/extraction/verify-extraction";
import { ReviewSubmission, type ModelExtraction } from "@/lib/extraction/schema";

const pages = [
  { pageNumber: 1, text: "Insurer Harbourlight Travel Insurance (Fictional) Ltd\nAnnual premium GBP 84.00, paid annually" },
  { pageNumber: 4, text: "4.7 Winter sports. We will not pay any claim arising from winter sports unless the endorsement is purchased." },
];

const nf = { value: null, status: "not_found" as const, page: null, quote: null, note: null };
const raw: ModelExtraction = {
  policy_type: "travel",
  policy_type_evidence: { page: 1, quote: "Harbourlight Travel Insurance" },
  fields: {
    insurer: { value: "Harbourlight Travel Insurance (Fictional) Ltd", status: "found", page: 1, quote: "Harbourlight Travel Insurance (Fictional) Ltd", note: null },
    display_name: nf,
    policy_number: nf,
    insured: nf,
    start_date: nf,
    end_date: nf,
    renewal_date: nf,
    premium_amount: { value: 84, status: "found", page: 1, quote: "Annual premium GBP 84.00", note: null },
    premium_frequency: { value: "annual", status: "found", page: 1, quote: "paid annually", note: null },
    currency: { value: "GBP", status: "found", page: 1, quote: "Annual premium GBP 84.00", note: null },
    excess_amount: nf,
  },
  limits: [],
  inclusions: [],
  exclusions: [
    { summary: "Winter sports are excluded unless you buy the endorsement.", page: 4, quote: "We will not pay any claim arising from winter sports" },
    { summary: "Invented exclusion", page: 4, quote: "This text is not in the document at all" },
  ],
  conditions: [],
  optional_extensions: [],
  missing_information: [],
  plain_english_summary: "A fictional travel policy.",
};

const verified = verifyExtraction(raw, pages);

const submission = (overrides: Partial<ReviewSubmission["fields"]> = {}, keepExclusions = [0, 1]) =>
  ReviewSubmission.parse({
    policy_type: "travel",
    fields: {
      insurer: "Harbourlight Travel Insurance (Fictional) Ltd",
      display_name: null,
      policy_number: null,
      insured: null,
      start_date: null,
      end_date: null,
      renewal_date: null,
      premium_amount: 84,
      premium_frequency: "annual",
      currency: "GBP",
      excess_amount: null,
      ...overrides,
    },
    keep: { limits: [], inclusions: [], exclusions: keepExclusions, conditions: [], optional_extensions: [] },
  });

describe("buildReviewedPolicy", () => {
  it("keeps machine evidence for unedited values", () => {
    const r = buildReviewedPolicy(verified, submission(), "doc-1", new Date("2026-10-14T00:00:00Z"));
    expect(r.fields.premium_amount).toMatchObject({ value: 84, machine_value: 84, edited: false });
    expect(r.fields.premium_amount.evidence).toMatchObject({ page: 1, verified: true });
  });

  it("marks user edits and drops machine evidence for them, preserving the machine value", () => {
    const r = buildReviewedPolicy(verified, submission({ premium_amount: 90, excess_amount: 75 }), "doc-1", new Date());
    expect(r.fields.premium_amount).toMatchObject({ value: 90, machine_value: 84, edited: true, evidence: null });
    expect(r.fields.excess_amount).toMatchObject({ value: 75, machine_value: null, edited: true, evidence: null });
  });

  it("only keeps list items the user ticked, and never keeps unverified quotes as evidence", () => {
    const r = buildReviewedPolicy(verified, submission({}, [0, 1]), "doc-1", new Date());
    expect(r.exclusions).toHaveLength(2);
    expect(r.exclusions[0].evidence).toMatchObject({ page: 4, verified: true });
    expect(r.exclusions[1].evidence).toEqual({ page: null, quote: null, verified: false });

    const only = buildReviewedPolicy(verified, submission({}, [0]), "doc-1", new Date());
    expect(only.exclusions.map((e) => e.summary)).toEqual(["Winter sports are excluded unless you buy the endorsement."]);
  });
});

describe("ReviewSubmission validation", () => {
  it("rejects an end date before the start date", () => {
    expect(() => submission({ start_date: "2026-11-03", end_date: "2025-11-02" })).toThrow();
  });
  it("rejects bad currency codes and impossible dates", () => {
    expect(() => submission({ currency: "pounds" })).toThrow();
    expect(() => submission({ renewal_date: "2026-02-31" })).toThrow();
  });
  it("turns empty text into null", () => {
    expect(submission({ insurer: "   " }).fields.insurer).toBeNull();
  });
  it("rejects negative amounts", () => {
    expect(() => submission({ premium_amount: -5 })).toThrow();
  });
});

describe("adding straight to the wallet after upload", () => {
  it("uses every value Cabinet read and keeps every list item", () => {
    const sub = defaultSubmission(verified);
    expect(sub.policy_type).toBe("travel");
    expect(sub.fields.insurer).toBe("Harbourlight Travel Insurance (Fictional) Ltd");
    expect(sub.fields.premium_amount).toBe(84);
    expect(sub.keep.exclusions).toEqual(verified.exclusions.map((_, i) => i));
  });

  it("leaves a value blank rather than saving one that doesn't make sense", () => {
    const odd = {
      ...verified,
      fields: {
        ...verified.fields,
        start_date: { ...verified.fields.start_date, value: "2026-12-01" },
        end_date: { ...verified.fields.end_date, value: "2026-01-01" },
      },
    };
    const sub = defaultSubmission(odd);
    expect(sub.fields.start_date).toBe("2026-12-01");
    expect(sub.fields.end_date).toBeNull();
  });

  it("records that the policy was added automatically, not checked by the person", () => {
    const auto = buildReviewedPolicy(verified, defaultSubmission(verified), "doc-1", new Date("2026-10-14T10:00:00Z"), "auto");
    expect(auto.added_by).toBe("auto");
    const byUser = buildReviewedPolicy(verified, submission(), "doc-1", new Date("2026-10-14T10:00:00Z"));
    expect(byUser.added_by).toBe("user");
  });
});
