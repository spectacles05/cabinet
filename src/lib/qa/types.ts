// Shared Q&A types (engine-agnostic).

export const ASSESSMENTS = ["covered", "excluded", "conditional", "insufficient_evidence", "information"] as const;
export type Assessment = (typeof ASSESSMENTS)[number];

/** A passage retrieved for the signed-in user (via RLS-scoped search). */
export type RetrievedChunk = {
  id: string;
  document_id: string;
  policy_id: string | null;
  page_number: number;
  text: string;
};

/** Minimal confirmed-policy context the answer engines may use. */
export type ScopePolicy = {
  id: string;
  name: string;
  policy_type: string;
  insurer: string | null;
  documentId: string | null;
  extensions: { name: string; status: string; page: number | null; quote: string | null }[];
  /** Details the user confirmed (excess, expiry…), so answers can be personal. Optional for older callers. */
  facts?: string[];
};

export type ProposedCitation = { chunk_id: string; quote: string; role?: "evidence" | "limit" | "context" };

/**
 * What an engine proposes; citations are verified before anything is shown. The shape is the
 * presentation: a one-line conclusion, a short "why", only the conditions that could change the
 * outcome, at most one next step, and anything else tucked away with the evidence.
 */
export type ProposedAnswer = {
  assessment: Assessment;
  /** The conclusion, first and in one short sentence. Older saved answers don't have it. */
  headline?: string;
  /** One or two short sentences of explanation (may be empty if the headline says it all). */
  answer: string;
  /** Conditions or exclusions that could change the outcome. Always shown, never cut. */
  conditions: string[];
  /** One useful next step, if there is one. */
  next_step?: string | null;
  /** Further detail, shown only when the user expands the evidence. */
  further_checks: string[];
  citations: ProposedCitation[];
};

export type VerifiedCitation = {
  chunk_id: string;
  document_id: string;
  policy_id: string | null;
  policy_name: string | null;
  page: number;
  quote: string;
};

export type QaAnswer = Omit<ProposedAnswer, "citations"> & {
  citations: VerifiedCitation[];
  engine: "claude" | "rules" | "demo";
  model: string;
  rejected_citations: number;
  downgraded: boolean; // true if the answer was turned into an abstention for lack of verified evidence
};

export const CANNOT_CONFIRM = "I can't confirm this from your policy.";

/** The plain conclusion for each verdict, used when an engine's own headline is missing or contradicts it. */
export const DEFAULT_HEADLINE: Record<Exclude<Assessment, "information">, string> = {
  covered: "You're covered.",
  excluded: "You're not covered.",
  conditional: "You're covered, but there are conditions.",
  insufficient_evidence: CANNOT_CONFIRM,
};
