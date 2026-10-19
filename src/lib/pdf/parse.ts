import { extractText, getDocumentProxy } from "unpdf";

export type ParsedPage = { pageNumber: number; text: string };
import { neutraliseInstructions } from "./instructions";

/** instructionsRemoved: sentences addressing software that were replaced (see instructions.ts). */
export type ParsedPdf = { pageCount: number; pages: ParsedPage[]; instructionsRemoved?: number };

export type PdfErrorCode =
  | "not_pdf"
  | "too_large"
  | "too_many_pages"
  | "unreadable"
  | "encrypted"
  | "no_text";

// Messages are safe to show users and to store in logs (no document content).
const MESSAGES: Record<PdfErrorCode, string> = {
  not_pdf: "This file is not a PDF. Please upload a PDF policy document.",
  too_large: "This PDF is larger than the upload limit.",
  too_many_pages: "This PDF has more pages than the current limit.",
  unreadable: "We couldn't read this PDF. It may be damaged or use an unsupported format.",
  encrypted: "This PDF is password-protected. Please upload an unlocked copy.",
  no_text:
    "We couldn't find any selectable text in this PDF. It may be a scanned image; scanned documents aren't supported yet.",
};

export class PdfError extends Error {
  constructor(public code: PdfErrorCode) {
    super(MESSAGES[code]);
    this.name = "PdfError";
  }
}

export type ParseLimits = { maxBytes: number; maxPages: number };

export const DEFAULT_LIMITS: ParseLimits = {
  maxBytes: Number(process.env.MAX_UPLOAD_MB ?? 15) * 1024 * 1024,
  maxPages: Number(process.env.MAX_PDF_PAGES ?? 50),
};

// Minimum average characters per page before we treat a document as having no text layer.
const MIN_CHARS_PER_PAGE = 20;

export function looksLikePdf(bytes: Uint8Array): boolean {
  // "%PDF-" may be preceded by a little junk; the spec allows it within the first 1024 bytes.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

function normaliseText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

export async function parsePdf(bytes: Uint8Array, limits: ParseLimits = DEFAULT_LIMITS): Promise<ParsedPdf> {
  if (bytes.byteLength > limits.maxBytes) throw new PdfError("too_large");
  if (!looksLikePdf(bytes)) throw new PdfError("not_pdf");

  let doc;
  try {
    // pdf.js may detach the buffer it is given, so pass a copy.
    doc = await getDocumentProxy(new Uint8Array(bytes));
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw new PdfError("encrypted");
    throw new PdfError("unreadable");
  }

  try {
    if (doc.numPages > limits.maxPages) throw new PdfError("too_many_pages");

    let text: string[];
    try {
      ({ text } = await extractText(doc, { mergePages: false }));
    } catch {
      throw new PdfError("unreadable");
    }

    // Untrusted text aimed at software is neutralised here, before any engine or quote check sees it.
    let instructionsRemoved = 0;
    const pages = text.map((t, i) => {
      const clean = neutraliseInstructions(normaliseText(t));
      instructionsRemoved += clean.removed;
      return { pageNumber: i + 1, text: clean.text };
    });
    const totalChars = pages.reduce((n, p) => n + p.text.length, 0);
    if (totalChars < MIN_CHARS_PER_PAGE * Math.max(1, pages.length)) throw new PdfError("no_text");

    return { pageCount: doc.numPages, pages, instructionsRemoved };
  } finally {
    // Release pdf.js resources; method availability varies between pdf.js builds.
    const d = doc as unknown as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> };
    await (d.destroy ?? d.cleanup)?.call(doc).catch(() => {});
  }
}
