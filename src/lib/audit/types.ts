// Audit ("Review my cover") findings. Every finding points at real policy/document/page evidence
// or at a value the user confirmed; none is generated from absence of text alone.

export const INSIGHT_TYPES = ["renewal_due", "exclusion", "possible_overlap", "missing_information"] as const;
export type InsightType = (typeof INSIGHT_TYPES)[number];
export type Priority = "low" | "medium" | "high";

export type FindingEvidence = {
  policy_id: string;
  policy_name: string;
  document_id: string | null;
  page: number | null;
  quote: string | null;
  /** "document" = quoted wording; "user_confirmed" = a value the user confirmed on the review screen */
  source: "document" | "user_confirmed";
};

/** How sure the finding is: the wording settles it, it may apply, or it can't be checked from what's been added. */
export type Certainty = "confirmed" | "possible" | "unverified";

/** The one thing the user can do about a finding. Each kind leads somewhere real. */
export type FindingAction =
  | { kind: "add_document"; policy_id: string } // attach the missing document to the policy
  | { kind: "compare" } // side-by-side wording from each policy
  | { kind: "contact_insurer"; policy_id: string; topic: string } // a ready-to-copy message
  | { kind: "ask"; policy_id: string | null; question: string }; // Ask Cabinet, prefilled

export type Finding = {
  type: InsightType;
  fingerprint: string; // stable key, so the same finding is updated rather than duplicated
  /** Short and issue-led: "No winter sports cover". */
  title: string;
  /** One sentence, shown by default. */
  explanation: string;
  /** The longer reasoning, shown on request. */
  detail: string | null;
  certainty: Certainty;
  action: FindingAction;
  priority: Priority;
  evidence: FindingEvidence[];
  due_date: string | null; // suggested task due date, where one is meaningful
  policy_ids: string[];
  /**
   * Asked before the finding is shown, when it only matters to some people (e.g. "Do you ski or
   * snowboard?" before flagging missing winter sports cover). "No" retires it; "Yes" shows it.
   */
  relevance_question?: string | null;
};

export const AUDIT_SCHEMA_VERSION = "audit-v4";
