// Recognising an incident in plain words (shared by claim triage and Ask). Pure: safe in the browser.
import type { IncidentType } from "./types";

export const TYPE_PATTERNS: [IncidentType, RegExp][] = [
  ["theft", /\b(stolen|stole|steal|theft|thief|thieves|robbed|robbery|burgl\w*|break[- ]?in|broke in|broken into|nicked|pickpocket\w*|mugged|snatched)\b/i],
  ["baggage", /\b(luggage|baggage|suitcase)\b[^.]*\b(lost|delayed|damaged|missing|didn'?t arrive)\b|\b(lost|delayed|damaged|missing)\b[^.]*\b(luggage|baggage|suitcase)\b/i],
  ["loss", /\b(lost|lose|losing|misplac\w*|left (it|my \w+) (on|in|at)|can'?t find)\b/i],
  ["medical", /\b(hospital|doctor|ill|sick|injur\w*|broke my (leg|arm|wrist|ankle|foot)|medical|ambulance|a&e|treatment)\b/i],
  ["travel_disruption", /\b(cancel\w*|delay\w*|missed (my )?(flight|train|connection)|strike|curtail\w*)\b/i],
  ["accidental_damage", /\b(dropped|drop|smashed|cracked|broke|broken|spilt|spilled|damaged|water damage|fell)\b/i],
];

// "Am I covered if…", "What happens when…": questions about what might happen, not something that did.
const HYPOTHETICAL = /^\s*(am|is|are|do|does|did|can|could|will|would|should|what|what's|whats|how|if|when|where|which|who|why)\b/i;
const HAPPENED = /\b(was|were|got|has been|have been|had|yesterday|today|tonight|last night|this morning|earlier|just|someone|somebody|i lost|i dropped|i broke|i've|i have)\b/i;

/** True when the words describe something that has happened (so a claim file could help). */
export function looksLikeIncident(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || HYPOTHETICAL.test(t)) return false;
  return TYPE_PATTERNS.some(([, re]) => re.test(t)) && HAPPENED.test(t);
}
