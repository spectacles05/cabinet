// The rule-based reader runs offline, so it is checked against the full ground truth on every test run.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf } from "@/lib/pdf/parse";
import { datesIn, extractWithRules } from "@/lib/extraction/rules";
import { verifyExtraction } from "@/lib/extraction/verify-extraction";
import type { FieldKey } from "@/lib/extraction/schema";
import groundTruth from "../samples/ground-truth.json";

type Truth = { value: string | number | null; page?: number };
const docs = groundTruth.documents as unknown as Record<string, { fields: Record<string, Truth> }>;

async function run(file: string) {
  const parsed = await parsePdf(new Uint8Array(readFileSync(join(process.cwd(), "samples", file))));
  const raw = extractWithRules(parsed.pages);
  return { raw, verified: verifyExtraction(raw, parsed.pages) };
}

describe("datesIn", () => {
  it("reads common UK date formats in order", () => {
    expect(datesIn("3 November 2025 to 2 November 2026")).toEqual(["2025-11-03", "2026-11-02"]);
    expect(datesIn("from 15/09/2026")).toEqual(["2026-09-15"]);
    expect(datesIn("November 3rd, 2026")).toEqual(["2026-11-03"]);
    expect(datesIn("31 February 2026")).toEqual([]);
  });
});

describe("rule-based extraction matches ground truth", () => {
  for (const [file, truth] of Object.entries(docs)) {
    it(`${file}: every ground-truth field is correct, verified, and on the right page`, async () => {
      const { verified } = await run(file);
      expect(verified.policy_type).toBe(truth.fields.policy_type.value);
      for (const [key, t] of Object.entries(truth.fields)) {
        if (key === "policy_type") continue;
        const got = verified.fields[key as FieldKey];
        if (t.value === null) {
          // Must not present a value as verified fact when the document doesn't state one.
          expect(got.status === "found" && got.value !== null, `${file}.${key} should be absent`).toBe(false);
        } else {
          expect(got.value, `${file}.${key}`).toBe(t.value);
          expect(got.status, `${file}.${key} status`).toBe("found");
          expect(got.check.verified, `${file}.${key} quote verified`).toBe(true);
          if (t.page) expect(got.check.page, `${file}.${key} page`).toBe(t.page);
        }
      }
      expect(verified.stats.rejected_citations).toBe(0);
    });
  }

  it("travel: finds the winter-sports exclusion (p4), off-piste rule (p5) and unpurchased endorsement", async () => {
    const { verified } = await run("travel.pdf");
    expect(verified.exclusions.some((e) => e.check.page === 4 && /winter sports/i.test(e.summary))).toBe(true);
    expect(verified.exclusions.some((e) => e.check.page === 5 && /off-piste/i.test(e.summary))).toBe(true);
    expect(verified.optional_extensions).toContainEqual(
      expect.objectContaining({ name: "Winter Sports Endorsement", status: "not_purchased" }),
    );
    expect(verified.limits.some((l) => /single article/i.test(l.label) && l.amount === 300)).toBe(true);
  });

  it("contents: flags the missing PP1 endorsement schedule", async () => {
    const { verified } = await run("contents.pdf");
    expect(verified.optional_extensions).toContainEqual(
      expect.objectContaining({ status: "referenced_not_provided" }),
    );
    expect(verified.missing_information.length).toBeGreaterThan(0);
    expect(verified.limits.some((l) => l.amount === 1500)).toBe(true);
  });

  it("gadget: premium is 'included', loss-not-covered exclusion found on p3", async () => {
    const { verified } = await run("gadget.pdf");
    expect(verified.fields.premium_frequency.value).toBe("included");
    expect(verified.exclusions.some((e) => e.check.page === 3 && /losing or misplacing/i.test(e.summary))).toBe(true);
  });
});
