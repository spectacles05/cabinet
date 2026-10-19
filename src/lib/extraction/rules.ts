// Rule-based (non-AI) policy reader. Used when Claude is unavailable.
// It only reports text it can match in the document; every value carries the verbatim line it came
// from, and the output goes through the same server-side evidence verification as AI output.
import type { PageText } from "@/lib/evidence/verify";
import type { ModelExtraction } from "./schema";

export const RULES_ENGINE_ID = "rules-v1";

// ───────────── text structure ─────────────

type Line = { page: number; text: string };
type Block = { page: number; text: string; heading: string };

function pageLines(page: PageText): string[] {
  return page.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^FICTIONAL SAMPLE — FOR COMPETITION TESTING ONLY$/.test(l)) // sample banner
    .filter((l) => !/\bPage \d+ of \d+\b/i.test(l)); // running footers
}

const TERMINAL = /[.:;!?)]$/;

function isHeading(line: string): boolean {
  return (
    line.length <= 70 &&
    !TERMINAL.test(line) &&
    !/\d[\d,]*(\.\d+)?\s*$/.test(line) && // kv rows usually end in a number/amount
    /^[A-Z]/.test(line) &&
    !/\b(GBP|EUR|USD|£|€)\b/.test(line)
  ) || /:$/.test(line);
}

/** Joins wrapped lines into paragraph blocks and remembers the most recent heading. */
function toBlocks(page: PageText): Block[] {
  const lines = pageLines(page);
  const blocks: Block[] = [];
  let heading = "";
  let current: string | null = null;
  let lastLine = "";
  const flush = () => {
    if (current) blocks.push({ page: page.pageNumber, text: current, heading });
    current = null;
  };
  for (const line of lines) {
    // A line continues the paragraph if it starts lowercase, or if the previous PHYSICAL line was
    // near full width (i.e. it wrapped). Short schedule rows never swallow the next row.
    const continues =
      current !== null && !TERMINAL.test(current) && (/^[a-z(]/.test(line) || lastLine.length >= 80);
    lastLine = line;
    if (continues) {
      current = `${current} ${line}`;
      continue;
    }
    flush();
    if (isHeading(line)) heading = line;
    current = line;
  }
  flush();
  return blocks;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z(])/).map((s) => s.trim()).filter(Boolean);
}

/** Cuts long text at a word boundary so it stays an exact substring of the page (for quotes). */
function clip(text: string, max = 240): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).trim();
}

/** Display version of clip(): marks shortened text with an ellipsis. */
function clipForDisplay(text: string, max = 240): string {
  const c = clip(text, max);
  return c.length < text.length ? `${c.replace(/[,;:]$/, "")}…` : c;
}

// ───────────── values ─────────────

const CURRENCY_PATTERNS: [RegExp, string][] = [
  [/\bGBP\b|£/i, "GBP"],
  [/\bEUR\b|€/i, "EUR"],
  [/\bUSD\b|US\$/i, "USD"],
  [/\bCNY\b|\bRMB\b|¥/i, "CNY"],
  [/\bHKD\b|HK\$/i, "HKD"],
];

const AMOUNT = /(?:GBP|EUR|USD|CNY|RMB|HKD|£|€|\$|¥)\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/gi;

function amounts(text: string): number[] {
  return [...text.matchAll(AMOUNT)].map((m) => Number(m[1].replace(/,/g, "") + (m[2] ?? "")));
}

function currencyOf(text: string): string | null {
  return CURRENCY_PATTERNS.find(([re]) => re.test(text))?.[1] ?? null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** All dates written in the text, in order. Supports "3 November 2025", "November 3, 2025", "03/11/2025", ISO. */
export function datesIn(text: string): string[] {
  const found: { at: number; date: string }[] = [];
  const monthAlt = MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join("|");
  const patterns: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthAlt})\\.?,?\\s+(\\d{4})\\b`, "gi"),
      (m) => iso(Number(m[3]), MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3))) + 1, Number(m[1]))],
    [new RegExp(`\\b(${monthAlt})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"),
      (m) => iso(Number(m[3]), MONTHS.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3))) + 1, Number(m[2]))],
    [/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (m) => iso(Number(m[3]), Number(m[2]), Number(m[1]))], // UK day-first
    [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => iso(Number(m[1]), Number(m[2]), Number(m[3]))],
  ];
  for (const [re, toIso] of patterns) {
    for (const m of text.matchAll(re)) {
      const d = toIso(m);
      if (d) found.push({ at: m.index ?? 0, date: d });
    }
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.date);
}

// ───────────── schedule fields ─────────────

const LABELS = {
  insurer: ["insurer", "underwriter", "underwritten by", "insured by", "insurance provider"],
  display_name: ["product", "policy name", "plan name", "cover type"],
  policy_number: ["policy number", "policy no\\.?", "policy reference", "policy ref\\.?", "certificate number", "reference number"],
  insured: ["insured persons?", "insured person\\(s\\)", "named insured", "policyholder", "policy holder", "account holder"],
  period: ["period of insurance", "period of cover", "cover period", "policy period", "insurance period"],
  start_date: ["cover start date", "start date", "effective date", "commencement date", "inception date"],
  end_date: ["cover end date", "end date", "expiry date", "expiration date"],
  renewal_date: ["renewal date"],
  premium: ["annual premium", "monthly premium", "total premium", "premium", "cost"],
  excess: ["policy excess", "standard excess", "compulsory excess", "excess"],
} as const;

type Hit = { page: number; label: string; value: string; quote: string };

/** Finds "Label value" rows (optionally "Label: value"), schedule pages first, joining wrapped values. */
function findRow(lines: Line[], labels: readonly string[]): Hit | null {
  for (const label of labels) {
    const re = new RegExp(`^(${label})\\s*:?\\s+(.+)$`, "i");
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i].text);
      if (!m || m[2].length < 1) continue;
      let quote = lines[i].text;
      let value = m[2];
      const next = lines[i + 1];
      if (next && next.page === lines[i].page && /^[a-z(]/.test(next.text)) {
        quote = `${quote} ${next.text}`;
        value = `${value} ${next.text}`;
      }
      return { page: lines[i].page, label: m[1], value: value.trim(), quote: clip(quote, 200) };
    }
  }
  return null;
}

type Field<T> = {
  value: T | null;
  status: "found" | "not_found" | "ambiguous";
  page: number | null;
  quote: string | null;
  note: string | null;
};

const notFound = <T>(note: string | null = null): Field<T> => ({ value: null, status: "not_found", page: null, quote: null, note });
const found = <T>(value: T, hit: Hit, note: string | null = null): Field<T> => ({
  value,
  status: "found",
  page: hit.page,
  quote: hit.quote,
  note,
});

// ───────────── policy type ─────────────

const TYPE_KEYWORDS: [ModelExtraction["policy_type"], RegExp][] = [
  ["travel", /\btravel\b|\btrips?\b|\bbaggage\b|repatriation/gi],
  ["contents", /\bcontents\b|household|sum insured/gi],
  ["gadget", /\bgadgets?\b|smartphone|mobile phone/gi],
  ["car", /\bmotor\b|\bvehicle insurance\b|no[- ]claims|\bcar insurance\b/gi],
  ["pet", /\bpet insurance\b|\bvet(erinary)? fees\b/gi],
  ["health", /\bhealth insurance\b|private medical/gi],
  ["life", /\blife insurance\b|\blife cover\b|death benefit/gi],
  ["renters", /\btenants?\b|renters/gi],
];

function detectType(pages: PageText[]): { type: ModelExtraction["policy_type"]; page: number | null; quote: string | null } {
  const titleLines = pages.slice(0, 1).flatMap((p) => pageLines(p).slice(0, 4).map((t) => ({ page: p.pageNumber, text: t })));
  const all = pages.map((p) => p.text).join("\n");
  let best: { type: ModelExtraction["policy_type"]; score: number } = { type: "other", score: 0 };
  for (const [type, re] of TYPE_KEYWORDS) {
    const body = (all.match(re) ?? []).length;
    const title = titleLines.reduce((n, l) => n + (l.text.match(re) ?? []).length, 0);
    const score = body + title * 10;
    if (score > best.score) best = { type, score };
  }
  if (best.score === 0) return { type: "other", page: null, quote: null };
  const re = TYPE_KEYWORDS.find(([t]) => t === best.type)![1];
  const evidence =
    titleLines.find((l) => new RegExp(re.source, "i").test(l.text)) ??
    pages.flatMap((p) => pageLines(p).map((t) => ({ page: p.pageNumber, text: t }))).find((l) => new RegExp(re.source, "i").test(l.text));
  return { type: best.type, page: evidence?.page ?? null, quote: evidence ? clip(evidence.text, 200) : null };
}

// ───────────── clause classification ─────────────

export const EXCLUSION_TRIGGER = /\bwe will not (pay|cover)\b|\bnot covered\b|\bis excluded\b|\bare excluded\b|\bno cover\b/i;
export const EXCLUSION_HEADING = /exclusion|not covered|we will not pay/i;
const CONDITION_TRIGGER = /\byou must\b|\bonly (be )?covered (if|when)\b|\bonly applies (where|if|when)\b|\bmust (report|tell|register|notify)\b/i;
const CONDITION_HEADING = /condition/i;
export const INCLUSION_TRIGGER = /\bwe will (also )?(cover|pay|repair or replace)\b|\b(is|are) (also )?covered\b/i;
export const NOT_A_CLAUSE = /\bthe most we will pay\b|\bamounts (below|above) are\b/i; // explanatory text, not cover
const INCLUSION_HEADING = /what is covered|what's covered|section [a-z0-9]+ — (?!exclusions)/i;
export const NUMBERED = /^([A-Z]?\d+(\.\d+)*)\s+\S/;

function clauseUnits(blocks: Block[]): { page: number; text: string; heading: string }[] {
  // Prefer whole numbered clauses when short; otherwise split into sentences.
  return blocks.flatMap((b) =>
    b.text.length <= 260 ? [b] : sentences(b.text).map((s) => ({ page: b.page, text: s, heading: b.heading })),
  );
}

/**
 * Sentence-level clauses of a piece of page text, each with the nearest heading above it.
 * Used by the rule-based Q&A engine to score and quote individual statements.
 */
export function sentenceClauses(text: string, pageNumber: number): { text: string; heading: string; numbered: boolean }[] {
  return toBlocks({ pageNumber, text }).flatMap((b) => {
    const numbered = NUMBERED.test(b.text);
    return sentences(b.text).map((s) => ({ text: s, heading: b.heading, numbered }));
  });
}

/** Finds amounts like "GBP 1,500" or "£75" in text. */
export function amountsIn(text: string): number[] {
  return amounts(text);
}

// ───────────── main ─────────────

export function extractWithRules(pages: PageText[]): ModelExtraction {
  // Schedule-like pages first (where key facts usually live), then the rest.
  const ordered = [...pages].sort((a, b) => {
    const s = (p: PageText) => (/schedule/i.test(p.text.slice(0, 400)) ? 0 : 1);
    return s(a) - s(b) || a.pageNumber - b.pageNumber;
  });
  const lines: Line[] = ordered.flatMap((p) => pageLines(p).map((text) => ({ page: p.pageNumber, text })));
  const blocks = pages.flatMap(toBlocks);

  // Fields
  const insurerHit = findRow(lines, LABELS.insurer);
  const nameHit = findRow(lines, LABELS.display_name);
  const numberHit = findRow(lines, LABELS.policy_number);
  const insuredHit = findRow(lines, LABELS.insured);
  const periodHit = findRow(lines, LABELS.period);
  const startHit = findRow(lines, LABELS.start_date);
  const endHit = findRow(lines, LABELS.end_date);
  const renewalHit = findRow(lines, LABELS.renewal_date);
  const premiumHit = findRow(lines, LABELS.premium);
  const excessHit = findRow(lines, LABELS.excess);

  const periodDates = periodHit ? datesIn(periodHit.value) : [];
  const startDate = startHit ? datesIn(startHit.value)[0] : undefined;
  const endDate = endHit ? datesIn(endHit.value)[0] : undefined;
  const renewalDate = renewalHit ? datesIn(renewalHit.value)[0] : undefined;

  const start_date: Field<string> = startDate
    ? found(startDate, startHit!)
    : periodDates[0]
      ? found(periodDates[0], periodHit!)
      : notFound();
  const end_date: Field<string> = endDate
    ? found(endDate, endHit!)
    : periodDates[1]
      ? found(periodDates[1], periodHit!)
      : notFound();

  // Premium
  let premium_amount: Field<number> = notFound();
  let premium_frequency: ModelExtraction["fields"]["premium_frequency"] = notFound();
  if (premiumHit) {
    const v = premiumHit.value.toLowerCase();
    if (/\bincluded in\b|\bpart of\b.*\bfee\b/.test(v)) {
      premium_amount = notFound("The cost is included in another product's fee; no separate premium is stated.");
      premium_frequency = found("included" as const, premiumHit);
    } else {
      const amt = amounts(premiumHit.value)[0];
      if (amt !== undefined) premium_amount = found(amt, premiumHit);
      const label = premiumHit.label.toLowerCase();
      const freq =
        /\bannual(ly)?\b|per (year|annum)|\byearly\b|a year/.test(v) || label.startsWith("annual")
          ? "annual"
          : /per month|\bmonthly\b|a month|\/\s*month/.test(v) || label.startsWith("monthly")
            ? "monthly"
            : /quarter/.test(v)
              ? "quarterly"
              : null;
      premium_frequency = freq
        ? found(freq, premiumHit)
        : { value: "unknown", status: "ambiguous", page: premiumHit.page, quote: premiumHit.quote, note: "Payment frequency isn't stated next to the premium." };
    }
  }

  // Excess
  let excess_amount: Field<number> = notFound();
  if (excessHit) {
    const amts = amounts(excessHit.value);
    if (amts.length) {
      const distinct = [...new Set(amts)];
      excess_amount = found(
        amts[0],
        excessHit,
        distinct.length > 1 ? "Several excess amounts are listed; this is the first one. Check which applies to you." : null,
      );
    }
  }

  const currencyHit = [premiumHit, excessHit].find((h) => h && currencyOf(h.value));
  const policyNumber = numberHit?.value.match(/[A-Z0-9][A-Z0-9\-/]{3,}/i)?.[0];

  // Lists
  const units = clauseUnits(blocks).filter((u) => u.text.length >= 30);
  const exclusions: ModelExtraction["exclusions"] = [];
  const conditions: ModelExtraction["conditions"] = [];
  const inclusions: ModelExtraction["inclusions"] = [];
  for (const u of units) {
    if (/FICTIONAL SAMPLE|not an offer of insurance/i.test(u.text) || NOT_A_CLAUSE.test(u.text)) continue;
    const item = { summary: clipForDisplay(u.text), page: u.page, quote: clip(u.text) };
    const underExclusions = EXCLUSION_HEADING.test(u.heading) && NUMBERED.test(u.text);
    if (EXCLUSION_TRIGGER.test(u.text) || underExclusions) exclusions.push(item);
    else if (CONDITION_TRIGGER.test(u.text) || (CONDITION_HEADING.test(u.heading) && NUMBERED.test(u.text))) conditions.push(item);
    else if (INCLUSION_TRIGGER.test(u.text) || (INCLUSION_HEADING.test(u.heading) && NUMBERED.test(u.text))) inclusions.push(item);
  }

  // Limits: short "label … amount" rows that talk about limits, or sit under a limits/benefits heading.
  const limits: ModelExtraction["limits"] = [];
  for (const b of blocks) {
    const line = b.text;
    if (line.length > 140 || /\.\s/.test(line) || /premium|excess|\bcost\b|\bfee\b/i.test(line)) continue;
    const amts = amounts(line);
    if (!amts.length) continue;
    if (!/limit|up to|maximum|sum insured|most we will pay/i.test(line) && !/limit|benefit|summary of cover/i.test(b.heading)) continue;
    const upTo = /up to\s*(?:GBP|EUR|USD|£|€|\$)\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/i.exec(line);
    const amount = upTo ? Number(upTo[1].replace(/,/g, "") + (upTo[2] ?? "")) : amts[0];
    const firstAmountAt = line.search(/(?:GBP|EUR|USD|CNY|RMB|HKD|£|€|\$|¥)\s?\d/i);
    const label = line.slice(0, firstAmountAt).replace(/\*|\bup to\b/gi, "").replace(/[\s:–—-]+$/, "").trim();
    if (label.length < 3) continue;
    limits.push({ label, amount, currency: currencyOf(line), page: b.page, quote: clip(line, 200) });
  }

  // Optional extensions: schedule rows ending in a purchase status.
  const optional_extensions: ModelExtraction["optional_extensions"] = [];
  for (const l of lines) {
    if (l.text.length > 110 || /\.\s/.test(l.text)) continue;
    const m =
      /^(.{3,80}?)\s+(NOT PURCHASED|NOT INCLUDED|NOT SELECTED|NOT TAKEN|PURCHASED|INCLUDED|SELECTED)\s*$/.exec(l.text) ??
      /^(.{3,80}?)\s+((?:see|refer to)\b.*schedule.*)$/i.exec(l.text);
    if (!m) continue;
    const s = m[2].toUpperCase();
    const status = s.startsWith("NOT") ? "not_purchased" : /SEE|REFER/.test(s) ? "referenced_not_provided" : "purchased";
    optional_extensions.push({ name: m[1].trim(), status, page: l.page, quote: l.text });
  }

  // Missing information: explicitly separate documents, and add-ons whose schedule isn't here.
  const missing_information: ModelExtraction["missing_information"] = [];
  for (const b of blocks) {
    const s = sentences(b.text).find((x) => /issued as a separate document|issued separately|separate (document|schedule)|not enclosed/i.test(x));
    if (s) missing_information.push({ description: `A separately issued document is referenced but not included: "${clip(s, 160)}"`, page: b.page, quote: clip(s) });
  }
  for (const e of optional_extensions.filter((x) => x.status === "referenced_not_provided")) {
    missing_information.push({
      description: `${e.name}: the details are in a separate schedule that isn't in this upload, so this cover can't be confirmed.`,
      page: e.page,
      quote: e.quote,
    });
  }

  const type = detectType(pages);
  const extraction: ModelExtraction = {
    policy_type: type.type,
    policy_type_evidence: { page: type.page, quote: type.quote },
    fields: {
      insurer: insurerHit ? found(insurerHit.value, insurerHit) : notFound(),
      display_name: nameHit ? found(nameHit.value, nameHit) : notFound(),
      policy_number: policyNumber && numberHit ? found(policyNumber, numberHit) : notFound(),
      insured: insuredHit ? found(insuredHit.value, insuredHit) : notFound(),
      start_date,
      end_date,
      renewal_date: renewalDate ? found(renewalDate, renewalHit!) : notFound(),
      premium_amount,
      premium_frequency,
      currency: currencyHit ? found(currencyOf(currencyHit.value)!, currencyHit) : notFound(),
      excess_amount,
    },
    limits: limits.slice(0, 12),
    inclusions: inclusions.slice(0, 10),
    exclusions: exclusions.slice(0, 12),
    conditions: conditions.slice(0, 8),
    optional_extensions: optional_extensions.slice(0, 10),
    missing_information: missing_information.slice(0, 8),
    plain_english_summary: "",
  };
  extraction.plain_english_summary = summarise(extraction);
  return extraction;
}

function summarise(e: ModelExtraction): string {
  const f = e.fields;
  const parts: string[] = [];
  const type = e.policy_type === "other" ? "An insurance" : `A ${e.policy_type}`;
  parts.push(`${type} policy${f.insurer.value ? ` from ${f.insurer.value}` : ""}.`);
  if (f.start_date.value || f.end_date.value) {
    const readable = (d: string | null) =>
      d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;
    parts.push(
      f.end_date.value
        ? `Cover runs from ${readable(f.start_date.value) ?? "an unstated date"} to ${readable(f.end_date.value)}.`
        : `Cover starts on ${readable(f.start_date.value)}; no end date is stated.`,
    );
  }
  parts.push(
    `The reader found ${e.exclusions.length} exclusion${e.exclusions.length === 1 ? "" : "s"}, ${e.limits.length} benefit limit${
      e.limits.length === 1 ? "" : "s"
    } and ${e.conditions.length} condition${e.conditions.length === 1 ? "" : "s"} in the wording.`,
  );
  if (e.missing_information.length) parts.push("Some details refer to documents that weren't uploaded.");
  parts.push("This summary was assembled by Cabinet's rule-based reader (no AI), so check the clauses below.");
  return parts.join(" ");
}
