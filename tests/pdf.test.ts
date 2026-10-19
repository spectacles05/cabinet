import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePdf, PdfError } from "@/lib/pdf/parse";
import { chunkPages } from "@/lib/pdf/chunk";
import groundTruth from "../samples/ground-truth.json";

const root = process.cwd();
const load = (...p: string[]) => new Uint8Array(readFileSync(join(root, ...p)));
const squash = (s: string) => s.replace(/\s+/g, " ");

type DocTruth = { pageCount: number; keyClauses: { id: string; page: number; mustContain: string }[] };
const docs = groundTruth.documents as Record<string, DocTruth>;

describe("parsePdf on fictional samples", () => {
  for (const [file, truth] of Object.entries(docs)) {
    it(`${file}: correct page count and clauses on expected pages`, async () => {
      const parsed = await parsePdf(load("samples", file));
      expect(parsed.pageCount).toBe(truth.pageCount);
      expect(parsed.pages.map((p) => p.pageNumber)).toEqual(
        Array.from({ length: truth.pageCount }, (_, i) => i + 1),
      );
      for (const p of parsed.pages) {
        expect(squash(p.text)).toContain("FICTIONAL SAMPLE");
        expect(squash(p.text)).toContain(`Page ${p.pageNumber} of ${truth.pageCount}`);
      }
      for (const clause of truth.keyClauses) {
        const pageText = squash(parsed.pages[clause.page - 1].text);
        expect(pageText, `${clause.id} on page ${clause.page}`).toContain(clause.mustContain);
      }
    });
  }
});

describe("parsePdf rejects bad input with clear errors", () => {
  const expectCode = async (bytes: Uint8Array, code: string, limits?: Parameters<typeof parsePdf>[1]) => {
    const err = await parsePdf(bytes, limits).catch((e) => e);
    expect(err).toBeInstanceOf(PdfError);
    expect((err as PdfError).code).toBe(code);
    expect((err as PdfError).message.length).toBeGreaterThan(10);
  };

  it("non-PDF bytes", () => expectCode(load("tests", "fixtures", "not-a-pdf.pdf"), "not_pdf"));
  it("malformed PDF", () => expectCode(load("tests", "fixtures", "malformed.pdf"), "unreadable"));
  it("image-only / scanned PDF", () => expectCode(load("tests", "fixtures", "image-only.pdf"), "no_text"));
  it("over the size limit", () =>
    expectCode(load("samples", "travel.pdf"), "too_large", { maxBytes: 100, maxPages: 50 }));
  it("over the page limit", () =>
    expectCode(load("samples", "travel.pdf"), "too_many_pages", { maxBytes: 15 * 1024 * 1024, maxPages: 3 }));
});

describe("chunkPages", () => {
  it("keeps every chunk on a single page and covers all page text", async () => {
    const parsed = await parsePdf(load("samples", "travel.pdf"));
    const chunks = chunkPages(parsed.pages, { targetChars: 400, overlapChars: 80 });
    expect(chunks.length).toBeGreaterThan(parsed.pageCount);
    chunks.forEach((c, i) => {
      expect(c.chunkIndex).toBe(i);
      expect(parsed.pages[c.pageNumber - 1].text).toContain(c.text);
    });
    // The off-piste clause must be findable inside a single page-5 chunk window.
    const page5 = chunks.filter((c) => c.pageNumber === 5).map((c) => squash(c.text)).join(" ");
    expect(page5).toContain("without a qualified guide or instructor is not covered");
  });

  it("makes progress on text with no natural break points", () => {
    const chunks = chunkPages([{ pageNumber: 1, text: "x".repeat(5000) }], { targetChars: 1000, overlapChars: 200 });
    expect(chunks.length).toBeGreaterThan(4);
    expect(chunks.length).toBeLessThan(10);
  });
});
