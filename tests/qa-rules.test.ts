// Offline Q&A check: the rule-based answer engine against the ground-truth questions, using the real
// parser, chunker and rule-based extraction (for add-on statuses), plus citation verification.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parsePdf } from "@/lib/pdf/parse";
import { chunkPages } from "@/lib/pdf/chunk";
import { extractWithRules } from "@/lib/extraction/rules";
import { analyseQuestion } from "@/lib/qa/query";
import { answerWithRules } from "@/lib/qa/rules-answer";
import { verifyAnswer } from "@/lib/qa/verify-citations";
import type { RetrievedChunk, ScopePolicy } from "@/lib/qa/types";
import groundTruth from "../samples/ground-truth.json";

const FILES = ["travel.pdf", "contents.pdf", "gadget.pdf"];
const chunks: Record<string, RetrievedChunk[]> = {};
const policies: Record<string, ScopePolicy> = {};

beforeAll(async () => {
  for (const file of FILES) {
    const parsed = await parsePdf(new Uint8Array(readFileSync(join(process.cwd(), "samples", file))));
    const ex = extractWithRules(parsed.pages);
    const id = `policy-${file}`;
    policies[file] = {
      id,
      name: file.replace(".pdf", ""),
      policy_type: ex.policy_type,
      insurer: ex.fields.insurer.value,
      documentId: `doc-${file}`,
      extensions: ex.optional_extensions.map((e) => ({ name: e.name, status: e.status, page: e.page, quote: e.quote })),
    };
    chunks[file] = chunkPages(parsed.pages).map((c) => ({
      id: `${file}#${c.chunkIndex}`,
      document_id: `doc-${file}`,
      policy_id: id,
      page_number: c.pageNumber,
      text: c.text,
    }));
  }
});

function ask(question: string, scope: string) {
  const files = scope === "wallet" ? FILES : [scope];
  const scoped = files.map((f) => policies[f]);
  const proposed = answerWithRules(analyseQuestion(question), files.flatMap((f) => chunks[f]), scoped);
  return verifyAnswer(proposed, files.flatMap((f) => chunks[f]), scoped, {
    engine: "rules",
    model: "rules-qa-v1",
    scopePolicyIds: scoped.map((p) => p.id),
  });
}

type Q = { id: string; scope: string; question: string; expectedAssessment: string; expectedAnswerContains?: string; expectedCitationPages?: number[] };

describe("rule-based Q&A on the benchmark questions", () => {
  for (const q of groundTruth.questions as Q[]) {
    it(`${q.id}: ${q.question}`, () => {
      const a = ask(q.question, q.scope);
      expect(a.assessment).toBe(q.expectedAssessment);
      expect(a.rejected_citations).toBe(0);
      expect(a.citations.length).toBeGreaterThan(0);
      // The visible reply: conclusion, explanation and the conditions that are always shown.
      if (q.expectedAnswerContains) expect([a.headline, a.answer, ...a.conditions].join(" ")).toContain(q.expectedAnswerContains);
      const pages = new Set(a.citations.map((c) => c.page));
      for (const p of q.expectedCitationPages ?? []) expect([...pages], `cites page ${p}`).toContain(p);
    });
  }

  for (const q of groundTruth.abstentionQuestions as Q[]) {
    it(`${q.id} abstains: ${q.question}`, () => {
      const a = ask(q.question, q.scope);
      expect(a.assessment).toBe("insufficient_evidence");
      expect(a.headline).toMatch(/can't confirm/i);
    });
  }
});

describe("Q&A safety behaviour", () => {
  it("never answers from another policy when scoped to one", () => {
    const a = ask("Am I covered if I lose my phone?", "travel.pdf");
    expect(a.citations.every((c) => c.policy_id === policies["travel.pdf"].id)).toBe(true);
  });

  it("rejects citations to passages outside the retrieved set, or quotes not in the passage", () => {
    const scoped = [policies["travel.pdf"]];
    const a = verifyAnswer(
      {
        assessment: "covered",
        answer: "Yes, fully covered.",
        conditions: [],
        further_checks: [],
        citations: [
          { chunk_id: "not-a-real-chunk", quote: "We will cover everything" },
          { chunk_id: chunks["travel.pdf"][3].id, quote: "Winter sports are always covered for free" },
        ],
      },
      chunks["travel.pdf"],
      scoped,
      { engine: "claude", model: "test", scopePolicyIds: [scoped[0].id] },
    );
    expect(a.rejected_citations).toBe(2);
    expect(a.assessment).toBe("insufficient_evidence");
    expect(a.downgraded).toBe(true);
  });

  it("vague questions get a prompt to be specific, not a verdict", () => {
    expect(ask("Am I covered?", "wallet").assessment).toBe("insufficient_evidence");
  });
});
