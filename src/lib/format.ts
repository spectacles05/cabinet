// Display helpers shared by server and client components.

export const POLICY_TYPE_LABEL: Record<string, string> = {
  travel: "Travel",
  contents: "Contents",
  gadget: "Gadget",
  car: "Car",
  renters: "Renters",
  health: "Health",
  life: "Life",
  pet: "Pet",
  other: "Other",
};

/** "Harbourlight Travel Insurance (Fictional) Ltd" → "Harbourlight": the name people actually use. */
export function insurerShortName(insurer: string | null | undefined): string | null {
  if (!insurer) return null;
  let s = insurer.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const SUFFIX = /\s+(ltd\.?|limited|plc|llp|inc\.?|uk|group|company|co\.?|services|insurance|assurance|travel|home|gadget|cover|underwriting)$/i;
  while (SUFFIX.test(s)) s = s.replace(SUFFIX, "");
  return s || insurer;
}

/** Amounts as people say them in replies: "GBP 1,500" → "£1,500". */
export function speakAmounts(text: string): string {
  return text.replace(/\bGBP\s?(\d[\d,]*(?:\.\d+)?)/g, "£$1").replace(/\bEUR\s?(\d[\d,]*(?:\.\d+)?)/g, "€$1").replace(/\bUSD\s?(\d[\d,]*(?:\.\d+)?)/g, "$$$1");
}

export const FREQUENCY_LABEL: Record<string, string> = {
  annual: "per year",
  monthly: "per month",
  quarterly: "per quarter",
  one_off: "one-off",
  included: "included in another product",
  unknown: "frequency unknown",
};

export function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount === null || amount === undefined) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency ?? ""} ${amount}`.trim();
  }
}

export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "3 November 2026" */
export function formatDateLong(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Whole days from `from` (default today, UTC) until an ISO date; negative if in the past. */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** Annualised premium where the frequency makes that meaningful; otherwise null. */
export function annualisedPremium(amount: number | null, frequency: string | null): number | null {
  if (amount === null) return null;
  switch (frequency) {
    case "annual":
      return amount;
    case "monthly":
      return Math.round(amount * 12 * 100) / 100;
    case "quarterly":
      return Math.round(amount * 4 * 100) / 100;
    default:
      return null;
  }
}
