// Every claim assessment passes through here before it is shown, and again before it is saved:
// quotes must appear on that page of the user's own document; contacts and deadlines must be in the
// quoted wording; "confirmed" needs a verified quote; no promises; no contact details from nowhere.
import { normaliseForMatch } from "@/lib/evidence/verify";
import { quoteInChunk } from "@/lib/qa/verify-citations";
import {
  DEFAULT_VERDICT_HEADLINE,
  type ChecklistItem,
  type ClaimAssessment,
  type ClaimCitation,
  type ClaimContact,
  type ClaimDeadline,
  type ClaimFact,
  type ProposedAssessment,
} from "./types";

export type PolicyChunk = { document_id: string; page_number: number; text: string };

const PROMISE = /guarantee|will (definitely |certainly )?(be paid|pay out|be accepted|be approved)|definitely (be )?covered|100%/i;
const UNSURE = /can'?t|cannot|not (confirmed|shown|included|listed|in)|isn'?t (shown|included|listed|in)|haven'?t|unclear|depends|may|might|missing|unknown|not sure/i;
// Phone numbers, emails and web addresses: only allowed when they come from verified wording.
// (Phone numbers start with + or 0, so amounts, dates and policy numbers aren't mistaken for them.)
const CONTACTISH = /(?:\+|\b0)\d[\d\s()-]{7,}\d|[\w.+-]+@[\w-]+\.[\w.]+|\bhttps?:\/\/\S+|\bwww\.\S+/gi;

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
const digits = (s: string) => s.replace(/[^\d+]/g, "");

function verifyCitation(c: ClaimCitation | null | undefined, chunks: PolicyChunk[]): ClaimCitation | null {
  if (!c?.quote?.trim()) return null;
  const hit = chunks.find((ch) => ch.document_id === c.document_id && ch.page_number === c.page && quoteInChunk(c.quote, ch.text));
  return hit ? { document_id: hit.document_id, page: hit.page_number, quote: clean(c.quote, 400) } : null;
}

/** The latest calendar day a deadline can fall on, counted from the incident date. */
export function dueDate(incidentDate: string | null, hours: number): string | null {
  if (!incidentDate) return null;
  const d = new Date(`${incidentDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + Math.ceil(hours / 24));
  return d.toISOString().slice(0, 10);
}

export function verifyAssessment(
  proposed: ProposedAssessment,
  chunks: PolicyChunk[],
  meta: { incidentDate: string | null; engine: ClaimAssessment["engine"]; model: string; userContacts?: ClaimContact[] },
): ClaimAssessment {
  let rejected = 0;
  const verifiedContacts: ClaimContact[] = [];

  // Contacts: the number or address must be in a verified quote from the policy.
  for (const c of proposed.contacts.slice(0, 4)) {
    const citation = verifyCitation(c.citation, chunks);
    const value = clean(c.value, 80);
    const inQuote =
      citation &&
      value &&
      (normaliseForMatch(citation.quote).includes(normaliseForMatch(value)) || (digits(value).length >= 7 && digits(citation.quote).includes(digits(value))));
    if (!inQuote) {
      rejected++;
      continue;
    }
    if (!verifiedContacts.some((x) => x.value === value || (digits(value).length >= 7 && digits(x.value) === digits(value)))) {
      verifiedContacts.push({ label: clean(c.label, 40) || "Contact", value, source: "policy", citation });
    }
  }
  const contacts = [...verifiedContacts, ...(meta.userContacts ?? [])];
  const allowed = contacts.map((c) => normaliseForMatch(c.value));
  /** Text may only mention contact details that were verified above. */
  const noInventedContacts = (text: string) => (text.match(CONTACTISH) ?? []).every((m) => allowed.some((a) => a.includes(normaliseForMatch(m)) || digits(a) === digits(m)));

  // Facts: a quote that doesn't verify sinks the fact; "confirmed" needs a verified quote.
  const facts: ClaimFact[] = [];
  for (const f of proposed.facts.slice(0, 10)) {
    const text = clean(f.text, 220);
    if (!text || PROMISE.test(text) || !noInventedContacts(text)) {
      rejected++;
      continue;
    }
    const citation = verifyCitation(f.citation, chunks);
    if (f.citation?.quote && !citation) {
      rejected++;
      continue;
    }
    if (!citation && !UNSURE.test(text)) {
      // An uncited statement is only kept when it says what can't be confirmed.
      rejected++;
      continue;
    }
    facts.push({ kind: f.kind, text, certainty: citation && f.certain ? "confirmed" : "uncertain", citation });
  }

  // Deadlines: the quoted wording must state that time limit.
  const deadlines: ClaimDeadline[] = [];
  for (const d of proposed.deadlines.slice(0, 4)) {
    const citation = verifyCitation(d.citation, chunks);
    const amount = Math.round(d.amount);
    const unit = d.unit === "days" ? "days?" : "hours?";
    const stated = citation && amount > 0 && new RegExp(`\\b${amount}\\s*(${unit})\\b`, "i").test(citation.quote);
    if (!stated) {
      rejected++;
      continue;
    }
    const hours = d.unit === "days" ? amount * 24 : amount;
    const action = clean(d.action, 80) || "Act";
    if (deadlines.some((x) => x.hours === hours && x.action === action)) continue;
    deadlines.push({ action, hours, due_date: dueDate(meta.incidentDate, hours), citation });
  }

  // Checklist: "from your policy" needs a verified quote; anything else is a suggestion.
  const checklist: ChecklistItem[] = [];
  for (const item of proposed.checklist.slice(0, 10)) {
    const label = clean(item.label, 100);
    if (!label || !noInventedContacts(label) || checklist.some((x) => normaliseForMatch(x.label) === normaliseForMatch(label))) continue;
    const citation = item.required_by_policy ? verifyCitation(item.citation, chunks) : null;
    if (item.required_by_policy && item.citation?.quote && !citation) rejected++;
    checklist.push({
      id: `c${checklist.length + 1}`,
      label,
      source: citation ? "policy" : "suggested",
      citation,
      done: Boolean(item.already_done),
      done_at: item.already_done ? new Date().toISOString() : null,
    });
  }

  // The verdict must be backed by confirmed wording; otherwise Cabinet says it can't confirm.
  const confirmed = (kinds: ClaimFact["kind"][]) => facts.some((f) => f.certainty === "confirmed" && kinds.includes(f.kind));
  let verdict = proposed.verdict;
  if (verdict === "likely_covered" && !confirmed(["cover"])) verdict = "unclear";
  if (verdict === "likely_not_covered" && !confirmed(["exclusion"])) verdict = "unclear";
  if (verdict === "conditional" && !confirmed(["cover", "exclusion", "condition"])) verdict = "unclear";

  let headline = clean(proposed.headline ?? "", 140);
  const contradicts =
    (verdict === "likely_not_covered" && /^(yes|you'?re covered|covered)\b/i.test(headline)) ||
    (verdict === "likely_covered" && /^(no|not covered|you'?re not covered)\b/i.test(headline)) ||
    (verdict === "unclear" && !UNSURE.test(headline));
  if (verdict !== proposed.verdict || !headline || PROMISE.test(headline) || contradicts || !noInventedContacts(headline)) {
    headline = DEFAULT_VERDICT_HEADLINE[verdict];
  }

  const next_steps = proposed.next_steps
    .map((s) => clean(s, 160))
    .filter((s) => {
      const ok = s && !PROMISE.test(s) && noInventedContacts(s);
      if (s && !ok) rejected++;
      return ok;
    })
    .slice(0, 3);

  return { verdict, headline, facts, deadlines, contacts, checklist, next_steps, engine: meta.engine, model: clean(meta.model, 60), rejected };
}

/** A saved/shown assessment back in proposal form, so it can be verified again before saving. */
export function toProposed(a: ClaimAssessment): ProposedAssessment {
  return {
    verdict: a.verdict,
    headline: a.headline,
    facts: a.facts.map((f) => ({ kind: f.kind, text: f.text, certain: f.certainty === "confirmed", citation: f.citation })),
    deadlines: a.deadlines.map((d) => {
      // Back to the unit the wording uses ("within 30 days"), so it verifies the same way again.
      const days = d.hours % 24 === 0 && new RegExp(`\\b${d.hours / 24}\\s*days?\\b`, "i").test(d.citation?.quote ?? "");
      return { action: d.action, amount: days ? d.hours / 24 : d.hours, unit: days ? ("days" as const) : ("hours" as const), citation: d.citation };
    }),
    contacts: a.contacts.filter((c) => c.source === "policy").map((c) => ({ label: c.label, value: c.value, citation: c.citation })),
    checklist: a.checklist.map((c) => ({ label: c.label, required_by_policy: c.source === "policy", already_done: c.done, citation: c.citation })),
    next_steps: a.next_steps,
  };
}
