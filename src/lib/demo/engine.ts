// Demo Mode engines. Pure functions over the user's own document text: nothing here can reach the
// network, and their output still goes through the normal server-side verification.
import type { ModelExtraction } from "@/lib/extraction/schema";
import type { ProposedAnswer, RetrievedChunk } from "@/lib/qa/types";
import { quoteInChunk } from "@/lib/qa/verify-citations";
import { PREPARED_ANSWERS, type PreparedAnswer } from "./answers";
import { DEMO_SAMPLES, identifySample, type DemoSample } from "./samples";

/** A prepared reading if the document is one of the fictional samples; otherwise null (use the rule-based reader). */
export function demoReading(pages: { pageNumber: number; text: string }[]): { sample: DemoSample; extraction: ModelExtraction } | null {
  const sample = identifySample(pages.map((p) => p.text).join("\n"));
  return sample ? { sample, extraction: structuredClone(sample.reading) } : null;
}

const words = (s: string) =>
  ` ${s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

function matches(question: string, entry: PreparedAnswer): boolean {
  const q = words(question);
  if (q === words(entry.prompt)) return true;
  const tokens = q.trim().split(" ");
  const has = (w: string) =>
    w.includes(" ") ? q.includes(` ${w} `) || q.includes(` ${w}`) : tokens.some((t) => t === w || (w.length >= 4 && t.startsWith(w)));
  return entry.match.some((group) => group.every(has));
}

/** Fictional samples whose text is among these passages (i.e. in the scope of the question). */
export function samplesIn(chunks: RetrievedChunk[]): DemoSample[] {
  return DEMO_SAMPLES.filter((s) => chunks.some((c) => c.text.includes(s.identifiers[1])));
}

export const DEMO_NOTE = "Demo Mode can't answer that one.";

/**
 * Answers from the prepared set. Citations are located in the user's own passages by their exact
 * wording; the caller then verifies them as usual. Anything else gets an honest "demo is limited" reply.
 */
export function demoAnswer(question: string, chunks: RetrievedChunk[]): { proposed: ProposedAnswer; preparedId: string | null } {
  const inScope = samplesIn(chunks);
  const candidates = PREPARED_ANSWERS.filter((p) => matches(question, p));
  const entry = candidates.find((p) => inScope.some((s) => s.id === p.sample));

  if (!entry) {
    const suggestions = PREPARED_ANSWERS.filter((p) => inScope.some((s) => s.id === p.sample)).map((p) => p.prompt);
    const elsewhere = candidates[0] ? DEMO_SAMPLES.find((s) => s.id === candidates[0].sample) : null;
    return {
      preparedId: null,
      proposed: {
        assessment: "insufficient_evidence",
        headline: DEMO_NOTE,
        answer: elsewhere
          ? `It's about the sample ${elsewhere.label} policy, which isn't part of what you're asking about.`
          : "It can only answer a few prepared questions. Try one of these:",
        conditions: [],
        next_step: null,
        further_checks: elsewhere
          ? ["Choose \"All policies\" (or add that sample policy), then ask again."]
          : suggestions.length
            ? suggestions.slice(0, 4)
            : ["Add one of the sample policies to try the prepared questions."],
        citations: [],
      },
    };
  }

  const citations = entry.citations.flatMap((c) => {
    const chunk =
      chunks.find((ch) => ch.page_number === c.page && quoteInChunk(c.quote, ch.text)) ?? chunks.find((ch) => quoteInChunk(c.quote, ch.text));
    return chunk ? [{ chunk_id: chunk.id, quote: c.quote }] : [];
  });
  return {
    preparedId: entry.id,
    proposed: {
      assessment: entry.assessment,
      headline: entry.headline,
      answer: entry.answer,
      conditions: entry.conditions,
      next_step: entry.next_step,
      further_checks: entry.further_checks,
      citations,
    },
  };
}
