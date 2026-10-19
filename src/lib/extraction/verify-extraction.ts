import {
  amountInQuote,
  currencyInQuote,
  dateInQuote,
  textInQuote,
  verifyQuote,
  type PageText,
} from "@/lib/evidence/verify";
import { FIELD_KEYS, type FieldKey, type FieldReview, type ItemCheck, type ModelExtraction, type VerifiedExtraction } from "./schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function valueInQuote(key: FieldKey, value: string | number, quote: string): boolean | null {
  switch (key) {
    case "premium_amount":
    case "excess_amount":
      return typeof value === "number" ? amountInQuote(value, quote) : false;
    case "start_date":
    case "end_date":
    case "renewal_date":
      return typeof value === "string" ? dateInQuote(value, quote) : false;
    case "currency":
      return typeof value === "string" ? currencyInQuote(value, quote) : false;
    case "insurer":
    case "policy_number":
      return typeof value === "string" ? textInQuote(value, quote) : false;
    default:
      return null; // free-text fields (names, frequency) are summarised, not copied
  }
}

function checkItem(pages: PageText[], quote: string | null, page: number | null): ItemCheck {
  const c = verifyQuote(pages, quote, page);
  return { verified: c.verified, page: c.page, page_corrected: c.pageCorrected };
}

/**
 * Turns raw (schema-valid) model output into reviewable, server-verified data:
 *  - every quote is checked against the stored page text (and re-pointed if on another page)
 *  - material values must appear in their own quote, otherwise they "need confirmation"
 *  - malformed dates are dropped rather than guessed
 * Nothing is invented here: values only ever come from the model's cited text or are null.
 */
export function verifyExtraction(raw: ModelExtraction, pages: PageText[]): VerifiedExtraction {
  let citations = 0;
  let rejected = 0;
  const count = (verified: boolean) => {
    citations++;
    if (!verified) rejected++;
  };

  const fields = {} as Record<FieldKey, FieldReview>;
  for (const key of FIELD_KEYS) {
    const f = raw.fields[key];
    let value = f.value as string | number | null;
    let note = f.note;

    if (value !== null && (key === "start_date" || key === "end_date" || key === "renewal_date")) {
      if (typeof value !== "string" || !isRealIsoDate(value)) {
        note = `The date "${String(value)}" could not be read reliably. Please enter it from your policy schedule.`;
        value = null;
      }
    }
    if (key === "currency" && typeof value === "string") value = value.trim().toUpperCase();

    if (value === null) {
      fields[key] = {
        value: null,
        status: f.status === "ambiguous" ? "ambiguous" : "not_found",
        quote: f.quote,
        note,
        check: { verified: false, page: null, claimed_page: f.page, page_corrected: false, value_in_quote: null },
      };
      continue;
    }

    const q = verifyQuote(pages, f.quote, f.page);
    count(q.verified);
    const inQuote = q.verified && f.quote ? valueInQuote(key, value, f.quote) : false;
    const trustworthy = q.verified && inQuote !== false && f.status === "found";

    fields[key] = {
      value,
      status: trustworthy ? "found" : f.status === "ambiguous" ? "ambiguous" : "needs_confirmation",
      quote: f.quote,
      note:
        note ??
        (!q.verified
          ? "We couldn't find the quoted wording in your document. Please check this value."
          : inQuote === false
            ? "The value doesn't appear in the quoted wording. Please check it."
            : null),
      check: {
        verified: q.verified,
        page: q.page,
        claimed_page: f.page,
        page_corrected: q.pageCorrected,
        value_in_quote: inQuote,
      },
    };
  }

  const verifyList = <T extends { quote: string | null; page: number | null }>(items: T[], max: number) =>
    items.slice(0, max).map((item) => {
      const check = checkItem(pages, item.quote, item.page);
      count(check.verified);
      return { ...item, check };
    });

  const policyTypeCheck = checkItem(pages, raw.policy_type_evidence.quote, raw.policy_type_evidence.page);

  const verified: VerifiedExtraction = {
    policy_type: raw.policy_type,
    policy_type_check: policyTypeCheck,
    fields,
    limits: verifyList(raw.limits, 12),
    inclusions: verifyList(raw.inclusions, 10),
    exclusions: verifyList(raw.exclusions, 12),
    conditions: verifyList(raw.conditions, 8),
    optional_extensions: verifyList(raw.optional_extensions, 10),
    // Missing-information notes may legitimately have no quote (e.g. "no schedule enclosed").
    missing_information: raw.missing_information.slice(0, 8).map((m) => ({
      ...m,
      check: m.quote ? checkItem(pages, m.quote, m.page) : { verified: false, page: null, page_corrected: false },
    })),
    plain_english_summary: raw.plain_english_summary,
    stats: { fields_found: 0, fields_missing: 0, citations, rejected_citations: rejected },
  };
  verified.stats.fields_found = FIELD_KEYS.filter((k) => fields[k].status === "found").length;
  verified.stats.fields_missing = FIELD_KEYS.length - verified.stats.fields_found;
  return verified;
}

/** Masks a policy number for display: keeps only the last 4 letters/digits. */
export function maskPolicyNumber(n: string | null | undefined): string | null {
  if (!n) return null;
  const alnum = n.replace(/[^A-Za-z0-9]/g, "");
  if (alnum.length <= 4) return "••••";
  return `•••• ${alnum.slice(-4)}`;
}
