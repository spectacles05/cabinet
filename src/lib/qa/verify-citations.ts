import { normaliseForMatch, MIN_QUOTE_CHARS } from "@/lib/evidence/verify";
import { CANNOT_CONFIRM, DEFAULT_HEADLINE, type Assessment, type ProposedAnswer, type QaAnswer, type RetrievedChunk, type ScopePolicy } from "./types";

export function quoteInChunk(quote: string, chunkText: string): boolean {
  const q = normaliseForMatch(quote);
  if (q.length < MIN_QUOTE_CHARS) return false;
  const t = normaliseForMatch(chunkText);
  return t.includes(q) || t.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""));
}

const SAYS_YES = /^(yes\b|you'?re covered\b|you are covered\b|it'?s covered\b|covered\b)/i;
const SAYS_NO = /^(no\b|you'?re not covered\b|you are not covered\b|it'?s not covered\b|not covered\b)/i;
const UNSURE = /can'?t confirm|cannot confirm|can'?t tell|can'?t answer|not possible to (say|tell)|unclear/i;

/**
 * The conclusion comes first, so it must agree with the verdict. A missing headline, or one that
 * contradicts the verdict ("Yes…" on an exclusion), is replaced by the plain conclusion for that verdict.
 */
export function settleHeadline(assessment: Assessment, headline: string | null | undefined): string {
  const h = (headline ?? "").replace(/\s+/g, " ").trim();
  if (assessment === "information") return h;
  const fallback = DEFAULT_HEADLINE[assessment];
  if (!h) return fallback;
  if (assessment === "covered" && (SAYS_NO.test(h) || UNSURE.test(h))) return fallback;
  if (assessment === "excluded" && (SAYS_YES.test(h) || UNSURE.test(h))) return fallback;
  if (assessment === "conditional" && UNSURE.test(h)) return fallback;
  if (assessment === "insufficient_evidence" && !UNSURE.test(h)) return fallback;
  return h;
}

const tidy = (items: string[] | undefined) => (items ?? []).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);

/**
 * Keeps only citations that point at a passage retrieved for THIS user and request, inside the
 * requested scope, whose quote really appears in that passage. If a substantive answer is left
 * with no verified evidence, it is downgraded to "can't confirm".
 */
export function verifyAnswer(
  proposed: ProposedAnswer,
  chunks: RetrievedChunk[],
  policies: ScopePolicy[],
  meta: { engine: QaAnswer["engine"]; model: string; scopePolicyIds: string[] | null },
): QaAnswer {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const names = new Map(policies.map((p) => [p.id, p.name]));
  const seen = new Set<string>();
  let rejected = 0;

  const citations: QaAnswer["citations"] = [];
  for (const c of proposed.citations) {
    const chunk = byId.get(c.chunk_id);
    const inScope = chunk && (meta.scopePolicyIds === null || (chunk.policy_id !== null && meta.scopePolicyIds.includes(chunk.policy_id)));
    if (!chunk || !inScope || !quoteInChunk(c.quote, chunk.text)) {
      rejected++;
      continue;
    }
    const key = `${chunk.id}|${normaliseForMatch(c.quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      policy_id: chunk.policy_id,
      policy_name: chunk.policy_id ? (names.get(chunk.policy_id) ?? null) : null,
      page: chunk.page_number,
      quote: c.quote.trim(),
    });
  }

  const substantive = proposed.assessment !== "insufficient_evidence";
  if (substantive && citations.length === 0) {
    return {
      assessment: "insufficient_evidence",
      headline: CANNOT_CONFIRM,
      answer: "I couldn't match an answer to the exact wording of your policy, so I'm not showing one.",
      conditions: [],
      next_step: "Check that part of your policy, or ask your insurer.",
      further_checks: [],
      citations: [],
      engine: meta.engine,
      model: meta.model,
      rejected_citations: rejected,
      downgraded: true,
    };
  }
  return {
    ...proposed,
    headline: settleHeadline(proposed.assessment, proposed.headline),
    answer: proposed.answer.replace(/\s+/g, " ").trim(),
    conditions: tidy(proposed.conditions),
    next_step: proposed.next_step?.trim() || null,
    further_checks: tidy(proposed.further_checks),
    citations,
    engine: meta.engine,
    model: meta.model,
    rejected_citations: rejected,
    downgraded: false,
  };
}
