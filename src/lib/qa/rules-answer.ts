// Rule-based (non-AI) answer engine. It finds the clauses that best match the question and only
// gives a verdict when the wording is explicit; otherwise it says it can't confirm. Replies follow
// Cabinet's style: the conclusion first, the deciding wording in one line, at most one next step.
import { normaliseForMatch } from "@/lib/evidence/verify";
import { amountsIn, datesIn, EXCLUSION_HEADING, EXCLUSION_TRIGGER, INCLUSION_TRIGGER, NOT_A_CLAUSE, sentenceClauses } from "@/lib/extraction/rules";
import { insurerShortName, speakAmounts } from "@/lib/format";
import { termMatches, type QuestionAnalysis } from "./query";
import { CANNOT_CONFIRM, type ProposedAnswer, type ProposedCitation, type RetrievedChunk, type ScopePolicy } from "./types";

export const RULES_QA_ID = "rules-qa-v2";

const CONDITIONAL = /\bunless\b|\bonly (be )?(covered|applies|apply|pay)\b|\bwhere (shown|it applies|this applies)\b|\bprovided (that|you)\b|\bsubject to\b|\bif you\b/i;
const POLICY_TYPE_LABEL: Record<string, string> = { car: "car", pet: "pet", health: "health", life: "life", renters: "renters" };

type Unit = {
  chunk: RetrievedChunk;
  policy: ScopePolicy | undefined;
  text: string;
  norm: string;
  heading: string;
  numbered: boolean;
  coverage: number; // number of distinct question concepts matched
  score: number;
  matchesTarget: boolean;
};

type Link = { name: string; status: string; page: number | null; quote: string | null };

function stripParens(s: string) {
  return s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

// When a clause depends on several add-ons, the most uncertain status decides.
const STATUS_PRIORITY: Record<string, number> = { referenced_not_provided: 0, unclear: 1, not_purchased: 2, purchased: 3 };

/** Finds the optional add-on/endorsement of the unit's policy that the clause depends on. */
function linkedExtension(unit: Unit): Link | null {
  const links: Link[] = [];
  for (const ext of unit.policy?.extensions ?? []) {
    const name = normaliseForMatch(stripParens(ext.name));
    // Reference codes such as "Endorsement Schedule PP1" shared by the clause and the schedule row.
    const codes = (ext.quote ?? "").match(/\b(?:endorsement|schedule|extension)(?:\s+schedule)?\s+[A-Z]{1,4}\d{0,3}\b/gi) ?? [];
    if ((name.length >= 6 && unit.norm.includes(name)) || codes.some((c) => unit.norm.includes(normaliseForMatch(c)))) {
      links.push(ext);
    }
  }
  links.sort((a, b) => (STATUS_PRIORITY[a.status] ?? 1) - (STATUS_PRIORITY[b.status] ?? 1));
  return links[0] ?? null;
}

function isExclusion(u: Unit) {
  return EXCLUSION_TRIGGER.test(u.text) || (EXCLUSION_HEADING.test(u.heading) && u.numbered);
}

// ── Wording helpers: short, personal, and never a paraphrase the rules can't stand behind ──

/** The insurer as people say it ("Kestrel"), or "Your insurer". */
const brand = (u?: { policy?: ScopePolicy }) => insurerShortName(u?.policy?.insurer) ?? "Your insurer";
const brandLower = (u?: { policy?: ScopePolicy }) => insurerShortName(u?.policy?.insurer) ?? "your insurer";
/** An add-on's everyday name: "Personal Possessions (away from home) extension — covers…" → "Personal Possessions extension". */
const addOn = (name: string) => {
  const n = stripParens(name).split(/\s[—–-]\s|[:;]|\.\s/)[0].trim();
  return /\b(extension|endorsement|cover|add-?on|option)\b/i.test(n) ? n : `${n} cover`;
};
/** The deciding clause as written, minus its clause number ("A3", "2.2"), with amounts as people say them. */
const says = (u: Unit) =>
  `“${speakAmounts(
    u.text
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[A-Z]?\d+(?:\.\d+)*\s+(?=[A-Z])/, "")
      .replace(/[.;:,]$/, ""),
  )}.”`;
/** The user's confirmed excess for the clause's policy, if known. */
const excessOf = (u?: Unit) => u?.policy?.facts?.find((f) => f.startsWith("standard excess "))?.replace("standard excess ", "") ?? null;

export function answerWithRules(
  question: QuestionAnalysis,
  chunks: RetrievedChunk[],
  policies: ScopePolicy[],
): ProposedAnswer {
  // Questions about a policy type the user hasn't uploaded.
  const missingType = question.mentionedTypes.find((t) => !policies.some((p) => p.policy_type === t));
  if (missingType) {
    const label = POLICY_TYPE_LABEL[missingType] ?? missingType;
    return {
      assessment: "insufficient_evidence",
      headline: CANNOT_CONFIRM,
      answer: `You haven't added a ${label} policy, so there's nothing to check this against.`,
      conditions: [],
      next_step: `Add your ${label} policy to Cabinet.`,
      further_checks: [],
      citations: [],
    };
  }
  if (question.concepts.length === 0) {
    return {
      assessment: "insufficient_evidence",
      headline: "I can't confirm that without a little more detail.",
      answer: `Try asking about a specific situation, like "Am I covered if my phone is stolen?"`,
      conditions: [],
      next_step: null,
      further_checks: [],
      citations: [],
    };
  }

  // Score every sentence of every retrieved passage against the question concepts.
  const policyById = new Map(policies.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const candidates: { chunk: RetrievedChunk; text: string; norm: string; heading: string; numbered: boolean; hits: number[] }[] = [];
  for (const chunk of chunks) {
    for (const c of sentenceClauses(chunk.text, chunk.page_number)) {
      if (c.text.length < 25 || /FICTIONAL SAMPLE|not an offer of insurance/i.test(c.text) || NOT_A_CLAUSE.test(c.text)) continue;
      const norm = normaliseForMatch(c.text);
      const key = `${chunk.document_id}|${chunk.page_number}|${norm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const hits = question.concepts.map(
        (concept) => concept.terms.filter((t) => termMatches(norm, t)).length + (termMatches(norm, concept.word) ? 1 : 0),
      );
      if (hits.some((h) => h > 0)) candidates.push({ chunk, ...c, norm, hits });
    }
  }
  // Rarer concepts (e.g. "bicycle") say more about relevance than common ones (e.g. "theft").
  const df = question.concepts.map((_, i) => candidates.filter((c) => c.hits[i] > 0).length);
  const units: Unit[] = candidates.map((c) => {
    let coverage = 0;
    let score = 0;
    let matchesTarget = false;
    c.hits.forEach((h, i) => {
      if (h === 0) return;
      coverage++;
      score += 2 + 2 / df[i] + Math.min(h - 1, 2) * 0.5;
      if (question.concepts[i].target) matchesTarget = true;
    });
    const policy = c.chunk.policy_id ? policyById.get(c.chunk.policy_id) : undefined;
    return { chunk: c.chunk, policy, text: c.text, norm: c.norm, heading: c.heading, numbered: c.numbered, coverage, score, matchesTarget };
  });
  units.sort((a, b) => b.coverage - a.coverage || b.score - a.score);

  const cite = (u: Unit, role: ProposedCitation["role"] = "evidence"): ProposedCitation => ({ chunk_id: u.chunk.id, quote: u.text, role });
  const askInsurer = (u?: Unit) => `Ask ${brandLower(u)} to confirm before you rely on it.`;

  // ── Information questions ("What is my excess?", "What's the most I can claim…?")
  if (question.intent === "information") {
    const factual = units.filter((u) => u.matchesTarget && (amountsIn(u.text).length > 0 || datesIn(u.text).length > 0));
    const best = factual[0];
    if (!best) {
      return {
        assessment: "insufficient_evidence",
        headline: CANNOT_CONFIRM,
        answer: "I couldn't find an amount or date for this in your policy wording.",
        conditions: [],
        next_step: askInsurer(units[0]),
        further_checks: [],
        citations: units.slice(0, 2).map((u) => cite(u, "context")),
      };
    }
    const extra = factual.slice(1).filter((u) => u.coverage >= best.coverage && u.chunk.policy_id !== best.chunk.policy_id).slice(0, 2);
    const words = best.text.split(/\s+/).length;
    return {
      assessment: "information",
      // A short line from the schedule is the answer itself; a long clause gets a one-line lead-in.
      headline: words <= 16 ? says(best).slice(1, -1) : `Here's what ${brand(best)} says.`,
      answer: words <= 16 ? "" : says(best),
      conditions: [],
      next_step: null,
      further_checks: extra.map((u) => `Your ${u.policy?.name ?? "other policy"}: ${says(u)}`),
      citations: [cite(best), ...extra.map((u) => cite(u))],
    };
  }

  // ── Coverage questions
  const maxCoverage = units[0]?.coverage ?? 0;
  const needed = Math.min(2, question.concepts.length);
  if (maxCoverage < needed) {
    const context = [...units].sort((a, b) => b.score - a.score).slice(0, 2);
    const dependency = context.map(linkedExtension).find((l) => l?.status === "referenced_not_provided");
    return {
      assessment: "insufficient_evidence",
      headline: CANNOT_CONFIRM,
      answer: dependency
        ? `It may depend on your ${addOn(dependency.name)}, which is in a document you haven't added.`
        : `${brand(context[0])}'s wording doesn't deal with this directly.`,
      conditions: [],
      next_step: dependency ? `Add the document for your ${addOn(dependency.name)}.` : askInsurer(context[0]),
      further_checks: [],
      citations: context.map((u) => cite(u, "context")),
    };
  }

  const primary = units.filter((u) => u.coverage === maxCoverage).slice(0, 3);
  const linked = new Map(primary.map((u) => [u, linkedExtension(u)]));

  // 1. The answer depends on a document that wasn't uploaded → abstain.
  const missingDoc = primary.find((u) => linked.get(u)?.status === "referenced_not_provided");
  if (missingDoc) {
    const ext = linked.get(missingDoc)!;
    return {
      assessment: "insufficient_evidence",
      headline: CANNOT_CONFIRM,
      answer: `It depends on your ${addOn(ext.name)}, which is in a separate document you haven't added.`,
      conditions: [],
      next_step: `Add that document, or ask ${brandLower(missingDoc)}.`,
      further_checks: [],
      citations: primary.map((u) => cite(u)),
    };
  }

  // "Firm" = the clause itself says it isn't covered (not just listed under an exclusions heading,
  // where qualifiers like "deeper than 18 metres" often limit it), and any "unless" can't apply.
  const firmExclusions = primary.filter(
    (u) => EXCLUSION_TRIGGER.test(u.text) && (!CONDITIONAL.test(u.text) || linked.get(u)?.status === "not_purchased"),
  );
  // Related exclusions that hinge on an add-on the user hasn't bought (e.g. winter sports) strengthen the answer.
  const relatedFirm = units
    .filter((u) => !primary.includes(u) && isExclusion(u) && linkedExtension(u)?.status === "not_purchased")
    .slice(0, 2);

  if (firmExclusions.length) {
    const lead = firmExclusions[0];
    const ext = [...firmExclusions, ...relatedFirm].map(linkedExtension).find((l) => l?.status === "not_purchased");
    const others = [...firmExclusions.slice(1), ...relatedFirm];
    return {
      assessment: "excluded",
      headline: "No, this doesn't look covered.",
      answer: ext ? `You didn't buy the ${addOn(ext.name)}, and ${brand(lead)} excludes this without it.` : `${brand(lead)}'s wording: ${says(lead)}`,
      conditions: [],
      next_step: ext ? `Ask ${brandLower(lead)} about adding the ${addOn(ext.name)}.` : null,
      further_checks: others.map(says),
      citations: [...firmExclusions, ...relatedFirm].map((u) => cite(u)),
    };
  }

  const inclusions = primary.filter((u) => INCLUSION_TRIGGER.test(u.text) && !isExclusion(u));
  if (inclusions.length) {
    const lead = inclusions[0];
    const ext = linked.get(lead);
    const conditional = CONDITIONAL.test(lead.text);
    // Limits that mention the same subject, e.g. "covered up to GBP 1,500".
    const limits = units
      .filter((u) => !inclusions.includes(u) && amountsIn(u.text).length > 0 && u.coverage >= maxCoverage - 1)
      .slice(0, 1);
    const excess = excessOf(lead);

    if (conditional && ext?.status === "not_purchased") {
      return {
        assessment: "excluded",
        headline: "No, this doesn't look covered.",
        answer: `It's only covered with the ${addOn(ext.name)}, which you didn't buy.`,
        conditions: [],
        next_step: `Ask ${brandLower(lead)} about adding it.`,
        further_checks: [],
        citations: [cite(lead)],
      };
    }
    if (!conditional || ext?.status === "purchased") {
      return {
        assessment: "covered",
        headline: "Yes, this looks covered.",
        answer: `${brand(lead)}'s wording: ${says(lead)}${excess ? ` A ${excess} excess applies.` : ""}`,
        conditions: [
          ...(ext?.status === "purchased" ? [`Only while the ${addOn(ext.name)} stays on your schedule.`] : []),
          ...limits.map((u) => `Limit: ${says(u)}`),
        ],
        next_step: null,
        further_checks: [],
        citations: [cite(lead), ...limits.map((u) => cite(u, "limit"))],
      };
    }
    return {
      assessment: "conditional",
      headline: "Possibly, but only if the conditions are met.",
      answer: `${brand(lead)}'s wording: ${says(lead)}`,
      conditions: limits.map((u) => `Limit: ${says(u)}`),
      next_step: null,
      further_checks: [],
      citations: [cite(lead), ...limits.map((u) => cite(u, "limit"))],
    };
  }

  const conditionalExclusions = primary.filter((u) => isExclusion(u));
  if (conditionalExclusions.length) {
    const lead = conditionalExclusions[0];
    return {
      assessment: "conditional",
      headline: "Possibly not, depending on the details.",
      answer: `${brand(lead)} excludes some cases: ${says(lead)}`,
      conditions: [],
      next_step: null,
      further_checks: conditionalExclusions.slice(1).map(says),
      citations: conditionalExclusions.map((u) => cite(u)),
    };
  }

  return {
    assessment: "insufficient_evidence",
    headline: CANNOT_CONFIRM,
    answer: "The closest wording doesn't clearly say either way.",
    conditions: [],
    next_step: askInsurer(primary[0]),
    further_checks: [],
    citations: primary.slice(0, 2).map((u) => cite(u, "context")),
  };
}
