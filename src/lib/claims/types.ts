// Claims preparation: shared types. Cabinet prepares a claim with the user; it never submits one.

export const INCIDENT_TYPES = ["theft", "loss", "accidental_damage", "medical", "travel_disruption", "baggage", "other"] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_LABEL: Record<IncidentType, string> = {
  theft: "Theft",
  loss: "Lost item",
  accidental_damage: "Accidental damage",
  medical: "Medical",
  travel_disruption: "Travel disruption",
  baggage: "Baggage",
  other: "Something else",
};

/** Answers to the short follow-up questions. Every key is optional until asked. */
export type ClaimAnswers = {
  when?: string; // ISO date, or "unknown"
  where?: "home" | "away" | "abroad" | "vehicle";
  forced_entry?: "yes" | "no" | "unsure";
  unattended?: "yes" | "no";
  police?: "yes" | "no";
  assistance?: "yes" | "no";
  evidence?: string[];
};

/** What Cabinet understood from the user's description (to be checked with the user). */
export type Triage = {
  incident_type: IncidentType;
  item: string | null;
  title: string;
  policy_id: string | null;
  /** Other policies that might also apply, best first. */
  alternatives: string[];
  /** Answers already clear from the description, shown pre-selected so the user can change them. */
  prefilled: ClaimAnswers;
  engine: "claude" | "rules";
};

/** A quote from the user's own policy document, verified to appear on that page. */
export type ClaimCitation = { document_id: string; page: number; quote: string };

export const VERDICTS = ["likely_covered", "conditional", "likely_not_covered", "unclear"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const FACT_KINDS = ["cover", "exclusion", "excess", "limit", "condition"] as const;
export type ClaimFact = {
  kind: (typeof FACT_KINDS)[number];
  text: string;
  /** "confirmed" only with a verified quote; anything else is shown as not confirmed. */
  certainty: "confirmed" | "uncertain";
  citation: ClaimCitation | null;
};

export type ClaimDeadline = {
  action: string; // e.g. "Report it to the police"
  hours: number;
  /** Latest calendar day it could fall on, when the incident date is known. */
  due_date: string | null;
  citation: ClaimCitation;
};

export type ClaimContact = { label: string; value: string; source: "policy" | "you"; citation: ClaimCitation | null };

export type ChecklistItem = {
  id: string;
  label: string;
  /** "policy": the wording asks for it (with a verified quote). "suggested": helpful, not stated in the policy. */
  source: "policy" | "suggested";
  citation: ClaimCitation | null;
  done: boolean;
  done_at: string | null;
};

export type ClaimAssessment = {
  verdict: Verdict;
  headline: string;
  facts: ClaimFact[];
  deadlines: ClaimDeadline[];
  contacts: ClaimContact[];
  checklist: ChecklistItem[];
  next_steps: string[];
  engine: "claude" | "rules" | "demo";
  model: string;
  /** Quotes, contacts or deadlines removed because they couldn't be matched to the wording. */
  rejected: number;
  /** Set when the user changed details that affect the guidance; cleared by a re-check. */
  stale?: boolean;
};

/** Draft as an engine proposes it, before verification. Quotes are checked against the user's own pages. */
export type ProposedAssessment = Omit<ClaimAssessment, "engine" | "model" | "rejected" | "checklist" | "deadlines" | "contacts" | "facts"> & {
  facts: { kind: ClaimFact["kind"]; text: string; certain: boolean; citation: ClaimCitation | null }[];
  deadlines: { action: string; amount: number; unit: "hours" | "days"; citation: ClaimCitation | null }[];
  contacts: { label: string; value: string; citation: ClaimCitation | null }[];
  checklist: { label: string; required_by_policy: boolean; already_done: boolean; citation: ClaimCitation | null }[];
};

export const DEFAULT_VERDICT_HEADLINE: Record<Verdict, string> = {
  likely_covered: "This looks covered, if your claim matches the wording.",
  conditional: "This may be covered, but conditions apply.",
  likely_not_covered: "This doesn't look covered.",
  unclear: "Cabinet can't confirm whether this is covered.",
};

export type ClaimStatus = "preparing" | "submitted" | "closed";

export type ClaimRow = {
  id: string;
  policy_id: string;
  title: string;
  description: string;
  incident_type: IncidentType;
  incident_date: string | null;
  answers_json: ClaimAnswers;
  assessment_json: ClaimAssessment;
  checklist_json: ChecklistItem[];
  status: ClaimStatus;
  confirmed_at: string;
  created_at: string;
  updated_at: string;
};
