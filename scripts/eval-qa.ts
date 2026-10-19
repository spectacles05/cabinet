// Live Q&A eval: Claude answers the ground-truth questions from the fictional samples, and every
// answer goes through the same citation verification as the app. Costs a few cents per question.
// Retrieval here passes all passages of the scoped sample(s) (the samples are only 4-6 pages);
// the app uses Postgres full-text search instead.
// Usage: npm run eval:qa
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { parsePdf } from "@/lib/pdf/parse";
import { chunkPages } from "@/lib/pdf/chunk";
import { extractWithRules } from "@/lib/extraction/rules";
import { getAnthropic } from "@/lib/ai/client";
import { answerWithClaude } from "@/lib/qa/claude-answer";
import { verifyAnswer } from "@/lib/qa/verify-citations";
import type { RetrievedChunk, ScopePolicy } from "@/lib/qa/types";

config({ path: ".env.local", quiet: true });
// Running an eval is an explicit choice to use (and pay for) Live AI, whatever the app is set to.
process.env.CABINET_MODE = "live";

type Q = { id: string; scope: string; question: string; expectedAssessment: string; expectedAnswerContains?: string; expectedCitationPages?: number[] };
const gt = JSON.parse(readFileSync("samples/ground-truth.json", "utf8")) as { questions: Q[]; abstentionQuestions: Q[] };
const FILES = ["travel.pdf", "contents.pdf", "gadget.pdf"];

async function main() {
  const chunks: Record<string, RetrievedChunk[]> = {};
  const policies: Record<string, ScopePolicy> = {};
  for (const file of FILES) {
    const parsed = await parsePdf(new Uint8Array(readFileSync(join("samples", file))));
    const ex = extractWithRules(parsed.pages);
    policies[file] = {
      id: `policy-${file}`,
      name: ex.fields.display_name.value ?? file,
      policy_type: ex.policy_type,
      insurer: ex.fields.insurer.value,
      documentId: `doc-${file}`,
      extensions: [],
    };
    chunks[file] = chunkPages(parsed.pages).map((c) => ({
      id: `${file}#${c.chunkIndex}`,
      document_id: `doc-${file}`,
      policy_id: `policy-${file}`,
      page_number: c.pageNumber,
      text: c.text,
    }));
  }

  const client = await getAnthropic();
  const rows = [];
  const outputs = [];
  let pass = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  for (const q of [...gt.questions, ...gt.abstentionQuestions]) {
    const files = q.scope === "wallet" ? FILES : [q.scope];
    const scope = files.map((f) => policies[f]);
    const scoped = files.flatMap((f) => chunks[f]);
    const t0 = Date.now();
    const r = await answerWithClaude(client, q.question, scoped, scope);
    tokensIn += r.inputTokens;
    tokensOut += r.outputTokens;
    const a = verifyAnswer(r.proposed, scoped, scope, { engine: "claude", model: r.model, scopePolicyIds: scope.map((p) => p.id) });
    const pages = [...new Set(a.citations.map((c) => c.page))].sort();
    const assessmentOk = a.assessment === q.expectedAssessment;
    const pagesOk = (q.expectedCitationPages ?? []).every((p) => pages.includes(p));
    // Since qa-v2 the reply is a headline plus a short explanation; an amount may be in either.
    const reply = [a.headline ?? "", a.answer, ...a.conditions].join(" ");
    const containsOk = !q.expectedAnswerContains || reply.includes(q.expectedAnswerContains);
    const ok = assessmentOk && pagesOk && containsOk && (q.expectedAssessment === "insufficient_evidence" || a.citations.length > 0);
    if (ok) pass++;
    rows.push({
      id: q.id,
      expected: q.expectedAssessment,
      got: a.assessment,
      pages: pages.join(","),
      expPages: (q.expectedCitationPages ?? []).join(","),
      cites: a.citations.length,
      rejected: a.rejected_citations,
      secs: ((Date.now() - t0) / 1000).toFixed(1),
      tokens: `${r.inputTokens}/${r.outputTokens}`,
      result: ok ? "PASS" : "FAIL",
    });
    outputs.push({ id: q.id, question: q.question, answer: a });
  }
  console.table(rows);
  console.log(`\nQ&A ACCURACY: ${pass}/${rows.length}`);
  // claude-opus-5-5 list prices: $4 per million input tokens, $20 per million output tokens.
  console.log(`TOKENS: ${tokensIn} in / ${tokensOut} out, about $${((tokensIn * 4 + tokensOut * 20) / 1e6).toFixed(3)}`);
  mkdirSync(join("private", "eval"), { recursive: true });
  writeFileSync(join("private", "eval", "qa-claude.json"), JSON.stringify(outputs, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
