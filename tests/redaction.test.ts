import { describe, expect, it } from "vitest";
import { redactMetadata } from "@/lib/runs/logger";

describe("redactMetadata", () => {
  it("keeps only allowlisted, identifier-like values", () => {
    const out = redactMetadata({
      document_id: "6f1c1c3e-1b1a-4c55-9f1e-1f0d5f1f2a11",
      page_count: 6,
      file_sha256: "a".repeat(64),
      error_code: "no_text",
      // all of these must be dropped:
      policy_text: "We will not pay any claim arising from winter sports",
      policyholder: "Alex Sample",
      question: "Am I covered for off-piste skiing?",
      model: "contains spaces and so is not identifier-like",
      chunk_count: Number.NaN,
    });
    expect(out).toEqual({
      document_id: "6f1c1c3e-1b1a-4c55-9f1e-1f0d5f1f2a11",
      page_count: 6,
      file_sha256: "a".repeat(64),
      error_code: "no_text",
    });
  });

  it("drops free text even under an allowlisted key", () => {
    expect(redactMetadata({ error_code: "Policy number HLT-2025-884213 for Alex" })).toEqual({});
  });
});
