import type { ParsedPage } from "./parse";

export type Chunk = { pageNumber: number; chunkIndex: number; text: string };

export type ChunkOptions = { targetChars: number; overlapChars: number };

const DEFAULTS: ChunkOptions = { targetChars: 1200, overlapChars: 200 };

/**
 * Splits page text into overlapping chunks. Chunks never cross a page boundary,
 * so every chunk maps to exactly one 1-indexed page for citations.
 * Splits prefer paragraph/sentence boundaries so quoted clauses stay intact.
 */
export function chunkPages(pages: ParsedPage[], opts: Partial<ChunkOptions> = {}): Chunk[] {
  const { targetChars, overlapChars } = { ...DEFAULTS, ...opts };
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const text = page.text.trim();
    if (!text) continue;

    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + targetChars, text.length);
      if (end < text.length) {
        const window = text.slice(start, end);
        const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(". "));
        if (breakAt > targetChars * 0.5) end = start + breakAt + 1;
      }
      chunks.push({ pageNumber: page.pageNumber, chunkIndex: chunkIndex++, text: text.slice(start, end).trim() });
      if (end >= text.length) break;
      // Step back for overlap, but always make forward progress.
      start = Math.max(end - overlapChars, start + 1);
    }
  }
  return chunks;
}
