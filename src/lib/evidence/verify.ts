// Checks that quoted evidence really exists in the stored document text.
// Used for extraction evidence now and Q&A citations later.

export type PageText = { pageNumber: number; text: string };

export type QuoteCheck =
  | { verified: true; page: number; claimedPage: number | null; pageCorrected: boolean }
  | { verified: false; page: null; claimedPage: number | null; pageCorrected: false };

/** Lower-cases and normalises quotes, dashes and whitespace so trivial differences don't fail a match. */
export function normaliseForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

const squashAll = (s: string) => normaliseForMatch(s).replace(/\s+/g, "");

function pageContains(pageText: string, quote: string): boolean {
  const q = normaliseForMatch(quote);
  if (!q) return false;
  if (normaliseForMatch(pageText).includes(q)) return true;
  // PDF text extraction sometimes adds/drops spaces; fall back to a whitespace-insensitive match.
  return squashAll(pageText).includes(squashAll(quote));
}

/** Minimum quote length; very short quotes ("GBP") would match almost anywhere. */
export const MIN_QUOTE_CHARS = 8;

/**
 * Verifies a quote against the claimed page first, then every other page. If it is found on a
 * different page, the evidence pointer is corrected to the page where the text actually appears.
 */
export function verifyQuote(pages: PageText[], quote: string | null | undefined, claimedPage: number | null | undefined): QuoteCheck {
  const claimed = typeof claimedPage === "number" ? claimedPage : null;
  if (!quote || normaliseForMatch(quote).length < MIN_QUOTE_CHARS) {
    return { verified: false, page: null, claimedPage: claimed, pageCorrected: false };
  }
  const claimedText = pages.find((p) => p.pageNumber === claimed)?.text;
  if (claimedText !== undefined && pageContains(claimedText, quote)) {
    return { verified: true, page: claimed!, claimedPage: claimed, pageCorrected: false };
  }
  const other = pages.find((p) => p.pageNumber !== claimed && pageContains(p.text, quote));
  if (other) return { verified: true, page: other.pageNumber, claimedPage: claimed, pageCorrected: true };
  return { verified: false, page: null, claimedPage: claimed, pageCorrected: false };
}

// ───────────── value ↔ quote consistency ─────────────

function amountVariants(n: number): string[] {
  const fixed2 = n.toFixed(2);
  const grouped = n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  const grouped2 = n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const variants = new Set([String(n), fixed2, grouped, grouped2]);
  return [...variants];
}

/** True when a numeric amount appears in the quote (e.g. 1500 ↔ "GBP 1,500"). */
export function amountInQuote(amount: number, quote: string): boolean {
  const q = normaliseForMatch(quote);
  return amountVariants(amount).some((v) => {
    // Require a non-digit (or edge) either side so "75" doesn't match "175".
    const escaped = v.replace(/[.,]/g, (c) => `\\${c}`);
    return new RegExp(`(^|[^0-9.,])${escaped}([^0-9]|$)`).test(q);
  });
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * True when an ISO date (YYYY-MM-DD) is written as ONE date in the quote, e.g. "3 November 2026",
 * "November 3, 2026", "03/11/2026" or "2026-11-03". Day, month and year must appear together, so a
 * quote like "3 November 2025 to 2 November 2026" does not support 2026-11-03.
 */
export function dateInQuote(iso: string, quote: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [, y, mo, d] = m;
  const q = normaliseForMatch(quote);
  const day = `0?${Number(d)}(?:st|nd|rd|th)?`;
  const monthName = MONTHS[Number(mo) - 1];
  const month = `(?:${monthName}|${monthName.slice(0, 3)}\\.?)`;
  const mNum = `0?${Number(mo)}`;
  const patterns = [
    `${day}\\s+(?:of\\s+)?${month},?\\s+${y}`, // 3 November 2026 / 3rd of Nov 2026
    `${month}\\s+${day},?\\s+${y}`, // November 3, 2026
    `${day}[/.-]${mNum}[/.-]${y}`, // 03/11/2026 (UK day-first)
    `${y}-${mo}-${d}`, // 2026-11-03
  ];
  return patterns.some((p) => new RegExp(`(^|[^0-9])${p}([^0-9]|$)`).test(q));
}

const CURRENCY_SIGNS: Record<string, string[]> = {
  GBP: ["gbp", "£", "pound"],
  EUR: ["eur", "€", "euro"],
  USD: ["usd", "$", "dollar"],
  CNY: ["cny", "rmb", "¥", "yuan"],
  HKD: ["hkd", "hk$"],
};

export function currencyInQuote(code: string, quote: string): boolean {
  const q = normaliseForMatch(quote);
  const signs = CURRENCY_SIGNS[code.toUpperCase()] ?? [code.toLowerCase()];
  return signs.some((s) => q.includes(s));
}

export function textInQuote(value: string, quote: string): boolean {
  return squashAll(quote).includes(squashAll(value));
}
