// The few follow-up questions that change what a policy says about a claim. Fixed and tappable, so
// answers are structured and nothing depends on free-text interpretation.
import type { ClaimAnswers, IncidentType } from "./types";

export type Choice = { value: string; label: string };
export type Question =
  | { id: "when"; kind: "date"; text: string }
  | { id: Exclude<keyof ClaimAnswers, "when" | "evidence">; kind: "choice"; text: string; options: Choice[] }
  | { id: "evidence"; kind: "multi"; text: string; options: Choice[] };

const YES_NO: Choice[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const EVIDENCE: Record<string, string> = {
  receipt: "Receipt or proof of ownership",
  photos: "Photos",
  police_ref: "Police reference number",
  repair_quote: "Repair quote",
  medical_report: "Medical report or bills",
  booking: "Booking confirmation",
  carrier_report: "Airline or carrier report",
};

const WHERE: Choice[] = [
  { value: "home", label: "At home" },
  { value: "away", label: "Out and about" },
  { value: "abroad", label: "Abroad" },
  { value: "vehicle", label: "In a car" },
];

const evidence = (keys: string[]): Question => ({
  id: "evidence",
  kind: "multi",
  text: "What do you have so far?",
  options: keys.map((k) => ({ value: k, label: EVIDENCE[k] })),
});

/** The essential questions for this kind of incident, given what's already known. At most five. */
export function questionsFor(type: IncidentType, answers: ClaimAnswers): Question[] {
  const q: Question[] = [{ id: "when", kind: "date", text: "When did it happen?" }];
  const where: Question = { id: "where", kind: "choice", text: "Where did it happen?", options: WHERE };
  switch (type) {
    case "theft":
      q.push(where);
      if (answers.where === "home" || answers.where === "vehicle") {
        q.push({ id: "forced_entry", kind: "choice", text: "Were there signs of a break-in?", options: [...YES_NO, { value: "unsure", label: "Not sure" }] });
      } else if (answers.where) {
        q.push({ id: "unattended", kind: "choice", text: "Was it left unattended?", options: YES_NO });
      }
      q.push({ id: "police", kind: "choice", text: "Have you reported it to the police?", options: YES_NO });
      q.push(evidence(["receipt", "photos", "police_ref"]));
      break;
    case "loss":
      q.push(where, evidence(["receipt", "photos"]));
      break;
    case "accidental_damage":
      q.push(where, evidence(["receipt", "photos", "repair_quote"]));
      break;
    case "medical":
      q.push({ id: "assistance", kind: "choice", text: "Have you called your insurer's emergency line?", options: YES_NO });
      q.push(evidence(["medical_report", "receipt"]));
      break;
    case "travel_disruption":
      q.push(evidence(["booking", "receipt"]));
      break;
    case "baggage":
      q.push(evidence(["carrier_report", "receipt", "photos"]));
      break;
    default:
      q.push(where, evidence(["receipt", "photos"]));
  }
  return q;
}

/** Questions still unanswered: the flow only asks these. */
export function remainingQuestions(type: IncidentType, answers: ClaimAnswers): Question[] {
  return questionsFor(type, answers).filter((q) => answers[q.id] === undefined);
}

/** A short line for the summary, e.g. "14 Oct · In a car". */
export function describeAnswers(answers: ClaimAnswers): string {
  const parts: string[] = [];
  if (answers.when && answers.when !== "unknown") {
    parts.push(new Date(`${answers.when}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }));
  }
  if (answers.where) parts.push(WHERE.find((w) => w.value === answers.where)?.label ?? "");
  return parts.filter(Boolean).join(" · ");
}
