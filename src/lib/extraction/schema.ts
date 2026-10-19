import { z } from "zod";

export const EXTRACTION_VERSION = "extract-v2"; // v2: flat union-free wire schema

export const POLICY_TYPES = ["travel", "contents", "gadget", "car", "renters", "health", "life", "pet", "other"] as const;
export const PREMIUM_FREQUENCIES = ["annual", "monthly", "quarterly", "one_off", "included", "unknown"] as const;
export const EXTENSION_STATUSES = ["purchased", "not_purchased", "referenced_not_provided", "unclear"] as const;

// ───────────── Internal extraction format (produced by either engine) ─────────────

// Structured outputs pass enums to the model as hints rather than hard constraints, so each enum
// falls back to its most cautious value instead of failing the whole extraction.
const FieldStatus = z.enum(["found", "not_found", "ambiguous"]).catch("ambiguous");

const evidence = {
  page: z.number().int().nullable().describe("1-indexed PDF page the quote comes from, or null"),
  quote: z
    .string()
    .nullable()
    .describe("Exact, verbatim text copied from that page (max ~200 characters) supporting the value, or null"),
};

const field = <T extends z.ZodType>(value: T, describe: string) =>
  z.object({
    value: value.nullable().describe(describe),
    status: FieldStatus.describe("found = explicitly stated; ambiguous = unclear/conflicting; not_found = not stated"),
    ...evidence,
    note: z.string().nullable().describe("Short explanation if ambiguous, conflicting or not found; otherwise null"),
  });

const sourcedItem = z.object({
  summary: z.string().describe("Plain-English summary of the clause (one sentence)"),
  ...evidence,
});

export const ModelExtraction = z.object({
  policy_type: z.enum(POLICY_TYPES).catch("other"),
  policy_type_evidence: z.object(evidence),
  fields: z.object({
    insurer: field(z.string(), "Legal name of the insurer/underwriter exactly as written"),
    display_name: field(z.string(), "Product or policy name, e.g. 'Annual Multi-Trip Travel Insurance'"),
    policy_number: field(z.string(), "Policy number or reference exactly as written"),
    insured: field(z.string(), "Insured persons and/or insured items, comma-separated"),
    start_date: field(z.string(), "Cover start date as YYYY-MM-DD"),
    end_date: field(z.string(), "Cover end/expiry date as YYYY-MM-DD"),
    renewal_date: field(z.string(), "Renewal date as YYYY-MM-DD, only if stated"),
    premium_amount: field(z.number(), "Premium amount for this policy as a number, without currency"),
    premium_frequency: field(z.enum(PREMIUM_FREQUENCIES).catch("unknown"), "How often the premium is paid"),
    currency: field(z.string(), "ISO 4217 currency code, e.g. GBP"),
    excess_amount: field(z.number(), "Standard/compulsory excess amount as a number"),
  }),
  limits: z
    .array(
      z.object({
        label: z.string().describe("What the limit applies to, e.g. 'Personal baggage — single item'"),
        amount: z.number().nullable(),
        currency: z.string().nullable(),
        page: evidence.page,
        quote: evidence.quote,
      }),
    )
    .describe("Key benefit limits (maximum 12)"),
  inclusions: z.array(sourcedItem).describe("Major things that are covered (maximum 10)"),
  exclusions: z.array(sourcedItem).describe("Important exclusions a young first-time policyholder should know (maximum 12)"),
  conditions: z.array(sourcedItem).describe("Important conditions/obligations, e.g. reporting deadlines (maximum 8)"),
  optional_extensions: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(EXTENSION_STATUSES).catch("unclear"),
        ...evidence,
      }),
    )
    .describe("Optional add-ons/endorsements and whether the documents show them as purchased"),
  missing_information: z
    .array(z.object({ description: z.string(), ...evidence }))
    .describe("Documents or details referenced but not included (e.g. a separate schedule), or needed to confirm cover"),
  plain_english_summary: z.string().describe("2-4 sentence plain-English summary of what this policy covers"),
});
export type ModelExtraction = z.infer<typeof ModelExtraction>;

// ───────────── Wire format sent to Claude's structured outputs ─────────────
// Structured outputs compile the schema into a grammar with limits on size and on nullable/union
// parameters. So the model-facing schema is deliberately flat and has no unions: the 11 key facts
// are one array of identical items, clauses/limits/add-ons are one list with a "kind", "" means
// not stated, page 0 means no page, and amounts come back as text and are parsed here.

const WIRE_FIELD_KEYS = Object.keys(ModelExtraction.shape.fields.shape);

const WireFact = z.object({
  key: z.string().describe(`Which fact: one of ${WIRE_FIELD_KEYS.join(", ")}`),
  value: z
    .string()
    .describe(
      "The value; empty if not stated. Dates as YYYY-MM-DD; amounts as plain numbers without currency or commas (e.g. 84.00); currency as an ISO code; premium_frequency as one of " +
        PREMIUM_FREQUENCIES.join(", "),
    ),
  status: FieldStatus.describe("found | not_found | ambiguous"),
  page: z.number().int().describe("1-indexed PDF page of the quote, or 0"),
  quote: z.string().describe("Exact verbatim text from that page (max ~200 characters), or empty"),
  note: z.string().describe("Short explanation if ambiguous, conflicting or not found; otherwise empty"),
});

const WireItem = z.object({
  text: z
    .string()
    .describe(
      "Clauses: one-sentence plain-English summary. Limits: short label. Add-ons: the add-on's name only, exactly as written (no description). Missing: what is missing and why it matters.",
    ),
  kind: z
    .string()
    .describe(
      "inclusion | exclusion | condition | limit | missing | extension:<status>, where status is purchased, not_purchased, referenced_not_provided or unclear",
    ),
  amount: z.string().describe("For limits: plain number without currency or commas; otherwise empty"),
  currency: z.string().describe("For limits: ISO currency code; otherwise empty"),
  page: z.number().int().describe("1-indexed PDF page of the quote, or 0"),
  quote: z.string().describe("Exact verbatim text from that page (max ~200 characters), or empty"),
});

export const WireExtraction = z.object({
  policy_type: z.enum(POLICY_TYPES).catch("other"),
  policy_type_page: z.number().int(),
  policy_type_quote: z.string(),
  facts: z.array(WireFact).describe(`One entry for each of: ${WIRE_FIELD_KEYS.join(", ")}`),
  items: z
    .array(WireItem)
    .describe(
      "Up to 12 key limits, 10 inclusions, 12 exclusions a young first-time policyholder should know, 8 conditions, every optional add-on/endorsement, and any referenced-but-missing documents",
    ),
  plain_english_summary: z.string().describe("2-4 sentence plain-English summary of what this policy covers"),
});
export type WireExtraction = z.infer<typeof WireExtraction>;

const EMPTY = /^(|null|none|n\/a|not stated|not found|unknown)$/i;
const text = (s: string): string | null => (EMPTY.test(s.trim()) ? null : s.trim());
const page = (n: number): number | null => (Number.isInteger(n) && n >= 1 ? n : null);
function amount(s: string): number | null {
  const t = s.replace(/[£€$,\s]|GBP|EUR|USD/gi, "");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

/** Converts the model's wire output to the internal format. Unparseable values become null (never guessed). */
export function wireToExtraction(w: WireExtraction): ModelExtraction {
  const fact = (key: string) => w.facts.find((f) => f.key.trim().toLowerCase() === key);
  const conv = <T>(key: string, parse: (raw: string) => T | null) => {
    const x = fact(key);
    if (!x) return { value: null, status: "not_found" as const, page: null, quote: null, note: null };
    const value = text(x.value) === null ? null : parse(x.value.trim());
    return {
      value,
      status: x.status,
      page: page(x.page),
      quote: text(x.quote),
      note:
        text(x.note) ??
        (value === null && text(x.value) ? `The document says "${x.value.trim()}", which could not be read as a value.` : null),
    };
  };
  const str = (raw: string) => raw;
  const freq = (raw: string) => {
    const f = raw.toLowerCase().replace(/[\s-]+/g, "_");
    return (PREMIUM_FREQUENCIES as readonly string[]).includes(f) ? (f as (typeof PREMIUM_FREQUENCIES)[number]) : "unknown";
  };
  const ev = (x: { page: number; quote: string }) => ({ page: page(x.page), quote: text(x.quote) });
  const kind = (k: string) => k.trim().toLowerCase();
  const items = (k: string) => w.items.filter((i) => kind(i.kind) === k);

  return {
    policy_type: w.policy_type,
    policy_type_evidence: { page: page(w.policy_type_page), quote: text(w.policy_type_quote) },
    fields: {
      insurer: conv("insurer", str),
      display_name: conv("display_name", str),
      policy_number: conv("policy_number", str),
      insured: conv("insured", str),
      start_date: conv("start_date", str),
      end_date: conv("end_date", str),
      renewal_date: conv("renewal_date", str),
      premium_amount: conv("premium_amount", amount),
      premium_frequency: conv("premium_frequency", freq),
      currency: conv("currency", (raw) => raw.toUpperCase()),
      excess_amount: conv("excess_amount", amount),
    },
    limits: items("limit").map((l) => ({ label: l.text, amount: amount(l.amount), currency: text(l.currency), ...ev(l) })),
    inclusions: items("inclusion").map((i) => ({ summary: i.text, ...ev(i) })),
    exclusions: items("exclusion").map((i) => ({ summary: i.text, ...ev(i) })),
    conditions: items("condition").map((i) => ({ summary: i.text, ...ev(i) })),
    optional_extensions: w.items
      .filter((i) => kind(i.kind).startsWith("extension"))
      .map((e) => {
        const st = kind(e.kind).split(":")[1]?.trim() ?? "";
        const status = (EXTENSION_STATUSES as readonly string[]).includes(st) ? (st as (typeof EXTENSION_STATUSES)[number]) : "unclear";
        return { name: e.text, status, ...ev(e) };
      }),
    missing_information: items("missing").map((m) => ({ description: m.text, ...ev(m) })),
    plain_english_summary: w.plain_english_summary,
  };
}

export type FieldKey = keyof ModelExtraction["fields"];
export const FIELD_KEYS = Object.keys(ModelExtraction.shape.fields.shape) as FieldKey[];

export const FIELD_LABELS: Record<FieldKey, string> = {
  insurer: "Insurer",
  display_name: "Policy name",
  policy_number: "Policy number",
  insured: "Insured persons / items",
  start_date: "Cover starts",
  end_date: "Cover ends",
  renewal_date: "Renewal date",
  premium_amount: "Premium",
  premium_frequency: "Payment frequency",
  currency: "Currency",
  excess_amount: "Excess",
};

// ───────────── Server-verified evidence (stored in field_sources_json) ─────────────

export type EvidenceCheck = {
  verified: boolean;
  page: number | null; // page where the quote was actually found
  claimed_page: number | null; // page the model claimed
  page_corrected: boolean;
  value_in_quote: boolean | null; // null when not applicable
};

export type FieldReview = {
  value: string | number | null;
  status: "found" | "not_found" | "ambiguous" | "needs_confirmation";
  quote: string | null;
  note: string | null;
  check: EvidenceCheck;
};

export type ItemCheck = { verified: boolean; page: number | null; page_corrected: boolean };

export type VerifiedExtraction = {
  /** Which engine produced the values: Claude, or the rule-based fallback reader. */
  engine?: "claude" | "rules" | "demo";
  policy_type: ModelExtraction["policy_type"];
  policy_type_check: ItemCheck;
  fields: Record<FieldKey, FieldReview>;
  limits: (ModelExtraction["limits"][number] & { check: ItemCheck })[];
  inclusions: (ModelExtraction["inclusions"][number] & { check: ItemCheck })[];
  exclusions: (ModelExtraction["exclusions"][number] & { check: ItemCheck })[];
  conditions: (ModelExtraction["conditions"][number] & { check: ItemCheck })[];
  optional_extensions: (ModelExtraction["optional_extensions"][number] & { check: ItemCheck })[];
  missing_information: (ModelExtraction["missing_information"][number] & { check: ItemCheck })[];
  plain_english_summary: string;
  stats: { fields_found: number; fields_missing: number; citations: number; rejected_citations: number };
};

// ───────────── Review form submission (user-confirmed values) ─────────────

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejects 2026-02-31
  }, "Not a real date")
  .nullable();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));

/** Details people add themselves: a name they recognise, the emergency line, a percentage excess. */
export const PolicyExtras = z.object({
  nickname: optText(80),
  emergency_phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+()0-9\s-]*$/, "Use digits, spaces, +, - or brackets")
    .nullable()
    .transform((s) => (s ? s : null)),
  excess_percent: z.number().min(0).max(100).nullable(),
});
export type PolicyExtras = z.infer<typeof PolicyExtras>;
export const NO_EXTRAS: PolicyExtras = { nickname: null, emergency_phone: null, excess_percent: null };

export const ReviewSubmission = z
  .object({
    policy_type: z.enum(POLICY_TYPES),
    extras: PolicyExtras.optional(),
    fields: z.object({
      insurer: optText(200),
      display_name: optText(200),
      policy_number: optText(80),
      insured: optText(500),
      start_date: isoDate,
      end_date: isoDate,
      renewal_date: isoDate,
      premium_amount: z.number().min(0).max(1_000_000).nullable(),
      premium_frequency: z.enum(PREMIUM_FREQUENCIES).nullable(),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code")
        .nullable(),
      excess_amount: z.number().min(0).max(1_000_000).nullable(),
    }),
    // Indices of machine-extracted list items the user chose to keep.
    keep: z.object({
      limits: z.array(z.number().int().min(0)).max(50),
      inclusions: z.array(z.number().int().min(0)).max(50),
      exclusions: z.array(z.number().int().min(0)).max(50),
      conditions: z.array(z.number().int().min(0)).max(50),
      optional_extensions: z.array(z.number().int().min(0)).max(50),
    }),
  })
  .refine((v) => !v.fields.start_date || !v.fields.end_date || v.fields.start_date <= v.fields.end_date, {
    message: "Cover end date must be after the start date",
    path: ["fields", "end_date"],
  });
export type ReviewSubmission = z.infer<typeof ReviewSubmission>;
