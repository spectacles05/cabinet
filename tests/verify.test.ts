import { describe, expect, it } from "vitest";
import { amountInQuote, currencyInQuote, dateInQuote, verifyQuote } from "@/lib/evidence/verify";
import { maskPolicyNumber, verifyExtraction } from "@/lib/extraction/verify-extraction";
import type { ModelExtraction } from "@/lib/extraction/schema";

const pages = [
  { pageNumber: 1, text: "Policy Schedule\nAnnual premium GBP 84.00, paid annually\nPolicy excess GBP 75 per insured person" },
  { pageNumber: 2, text: "Single article, pair or set limit GBP 300\nPeriod of insurance 3 November 2025 to 2 November 2026" },
];

describe("verifyQuote", () => {
  it("verifies a quote on the claimed page, ignoring whitespace and case", () => {
    expect(verifyQuote(pages, "annual  premium gbp 84.00", 1)).toMatchObject({ verified: true, page: 1, pageCorrected: false });
  });
  it("corrects the page when the quote is on a different page", () => {
    expect(verifyQuote(pages, "set limit GBP 300", 1)).toMatchObject({ verified: true, page: 2, pageCorrected: true });
  });
  it("rejects quotes that are not in the document", () => {
    expect(verifyQuote(pages, "winter sports are fully covered", 1).verified).toBe(false);
  });
  it("rejects missing or too-short quotes", () => {
    expect(verifyQuote(pages, null, 1).verified).toBe(false);
    expect(verifyQuote(pages, "GBP", 1).verified).toBe(false);
  });
  it("normalises curly quotes and dashes", () => {
    const p = [{ pageNumber: 1, text: "FICTIONAL SAMPLE — don’t copy" }];
    expect(verifyQuote(p, "FICTIONAL SAMPLE - don't copy", 1).verified).toBe(true);
  });
});

describe("value-in-quote checks", () => {
  it("amounts", () => {
    expect(amountInQuote(84, "GBP 84.00, paid annually")).toBe(true);
    expect(amountInQuote(1500, "single article limit of GBP 1,500")).toBe(true);
    expect(amountInQuote(75, "GBP 175 per claim")).toBe(false);
    expect(amountInQuote(8.5, "GBP 8.50 per month")).toBe(true);
  });
  it("dates", () => {
    expect(dateInQuote("2025-11-03", "3 November 2025 to 2 November 2026")).toBe(true);
    expect(dateInQuote("2026-11-03", "3 November 2025 to 2 November 2026")).toBe(false);
    expect(dateInQuote("2026-09-15", "15/09/2026")).toBe(true);
  });
  it("currency", () => {
    expect(currencyInQuote("GBP", "Premium £8.50")).toBe(true);
    expect(currencyInQuote("EUR", "GBP 8.50")).toBe(false);
  });
});

function rawExtraction(overrides: Partial<ModelExtraction["fields"]> = {}): ModelExtraction {
  const nf = { value: null, status: "not_found" as const, page: null, quote: null, note: null };
  return {
    policy_type: "travel",
    policy_type_evidence: { page: 1, quote: "Policy Schedule" },
    fields: {
      insurer: nf,
      display_name: nf,
      policy_number: nf,
      insured: nf,
      start_date: nf,
      end_date: nf,
      renewal_date: nf,
      premium_amount: nf,
      premium_frequency: nf,
      currency: nf,
      excess_amount: nf,
      ...overrides,
    },
    limits: [],
    inclusions: [],
    exclusions: [],
    conditions: [],
    optional_extensions: [],
    missing_information: [],
    plain_english_summary: "Test.",
  };
}

describe("verifyExtraction", () => {
  it("accepts a value supported by a verified quote", () => {
    const v = verifyExtraction(
      rawExtraction({ premium_amount: { value: 84, status: "found", page: 1, quote: "Annual premium GBP 84.00", note: null } }),
      pages,
    );
    expect(v.fields.premium_amount).toMatchObject({ value: 84, status: "found", check: { verified: true, value_in_quote: true } });
    expect(v.stats).toMatchObject({ fields_found: 1, citations: 1, rejected_citations: 0 });
  });

  it("flags a value that is not in its quote (hallucinated number)", () => {
    const v = verifyExtraction(
      rawExtraction({ premium_amount: { value: 120, status: "found", page: 1, quote: "Annual premium GBP 84.00", note: null } }),
      pages,
    );
    expect(v.fields.premium_amount.status).toBe("needs_confirmation");
    expect(v.fields.premium_amount.check.value_in_quote).toBe(false);
  });

  it("flags a fabricated quote", () => {
    const v = verifyExtraction(
      rawExtraction({ excess_amount: { value: 0, status: "found", page: 1, quote: "There is no excess on this policy", note: null } }),
      pages,
    );
    expect(v.fields.excess_amount.status).toBe("needs_confirmation");
    expect(v.stats.rejected_citations).toBe(1);
  });

  it("drops malformed dates instead of guessing", () => {
    const v = verifyExtraction(
      rawExtraction({ start_date: { value: "3rd Nov 2025", status: "found", page: 2, quote: "3 November 2025 to 2 November 2026", note: null } }),
      pages,
    );
    expect(v.fields.start_date.value).toBeNull();
    expect(v.fields.start_date.note).toMatch(/could not be read/);
  });

  it("keeps not-found fields as null", () => {
    const v = verifyExtraction(rawExtraction(), pages);
    expect(v.fields.renewal_date).toMatchObject({ value: null, status: "not_found" });
    expect(v.stats.fields_missing).toBe(11);
  });
});

describe("maskPolicyNumber", () => {
  it("keeps only the last four characters", () => {
    expect(maskPolicyNumber("HLT-2025-884213")).toBe("•••• 4213");
    expect(maskPolicyNumber("AB1")).toBe("••••");
    expect(maskPolicyNumber(null)).toBeNull();
  });
});
