// Evidence kinds and labels (shared by the server and the Claim File screen).

export const EVIDENCE_BUCKET = "claim-evidence";

export const EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
export const EVIDENCE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

export const EVIDENCE_KINDS = ["receipt", "photo", "police_report", "correspondence", "other"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const KIND_LABEL: Record<EvidenceKind, string> = {
  receipt: "Receipt",
  photo: "Photo",
  police_report: "Police report",
  correspondence: "Letter or email",
  other: "Document",
};

/** The type a browser reports can be empty or vague, so fall back to the file extension. */
export function evidenceType(fileName: string, reported: string): EvidenceType | null {
  if ((EVIDENCE_TYPES as readonly string[]).includes(reported)) return reported as EvidenceType;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, EvidenceType> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
  return byExt[ext] ?? null;
}

/** A sensible kind from the checklist item it was added for, the file name, or the type. */
export function guessKind(fileName: string, type: EvidenceType, hint?: string | null): EvidenceKind {
  const text = `${hint ?? ""} ${fileName}`.toLowerCase();
  if (/police|crime/.test(text)) return "police_report";
  if (/receipt|invoice|proof of (ownership|purchase)|order confirmation/.test(text)) return "receipt";
  if (/letter|email|correspondence|reply/.test(text)) return "correspondence";
  if (/photo/.test(text) || type.startsWith("image/")) return "photo";
  return "other";
}
