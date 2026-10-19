// Generates the fictional sample policy PDFs plus negative-test fixtures.
// Usage: npm run samples
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { SAMPLE_DOCS, type SampleDoc } from "./sample-content";

const BANNER = "FICTIONAL SAMPLE — FOR COMPETITION TESTING ONLY";
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 56;
const NAVY = rgb(0.09, 0.16, 0.32);
const RED = rgb(0.7, 0.1, 0.1);
const GREY = rgb(0.35, 0.35, 0.35);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildDoc(doc: SampleDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} (FICTIONAL SAMPLE)`);
  pdf.setAuthor("Cabinet test fixtures");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const total = doc.pages.length;
  const textW = PAGE_W - MARGIN * 2;

  doc.pages.forEach((blocks, i) => {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 40;
    page.drawText(BANNER, { x: MARGIN, y, size: 10, font: bold, color: RED });
    y -= 22;
    for (const line of wrap(doc.title, bold, 13, textW)) {
      page.drawText(line, { x: MARGIN, y, size: 13, font: bold, color: NAVY });
      y -= 17;
    }
    y -= 10;

    for (const block of blocks) {
      if (block.kind === "h") {
        y -= 4;
        page.drawText(block.text, { x: MARGIN, y, size: 12, font: bold, color: NAVY });
        y -= 20;
      } else if (block.kind === "p") {
        for (const line of wrap(block.text, regular, 10, textW)) {
          page.drawText(line, { x: MARGIN, y, size: 10, font: regular });
          y -= 14;
        }
        y -= 6;
      } else {
        const labelW = 200;
        for (const [label, value] of block.rows) {
          const valueLines = wrap(value, regular, 10, textW - labelW);
          page.drawText(label, { x: MARGIN, y, size: 10, font: bold });
          valueLines.forEach((vl, j) => {
            page.drawText(vl, { x: MARGIN + labelW, y: y - j * 14, size: 10, font: regular });
          });
          y -= 14 * valueLines.length + 4;
        }
        y -= 6;
      }
    }

    page.drawText(`${doc.reference}  ·  Page ${i + 1} of ${total}`, {
      x: MARGIN,
      y: 30,
      size: 9,
      font: regular,
      color: GREY,
    });
    page.drawText(BANNER, { x: PAGE_W - MARGIN - bold.widthOfTextAtSize(BANNER, 7), y: 30, size: 7, font: bold, color: RED });
  });

  return pdf.save();
}

// A PDF with drawn shapes but no text layer — stands in for a scanned document.
async function buildImageOnly(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  for (let i = 0; i < 30; i++) {
    page.drawRectangle({ x: MARGIN, y: PAGE_H - 80 - i * 22, width: 300 + (i % 5) * 30, height: 10, color: rgb(0.6, 0.6, 0.6) });
  }
  return pdf.save();
}

async function main() {
  const outDir = join(process.cwd(), "samples");
  // Also served publicly so the in-app "try a fictional sample" option can load them.
  const publicDir = join(process.cwd(), "public", "samples");
  const fixtureDir = join(process.cwd(), "tests", "fixtures");
  for (const dir of [outDir, publicDir, fixtureDir]) mkdirSync(dir, { recursive: true });

  for (const doc of SAMPLE_DOCS) {
    const bytes = await buildDoc(doc);
    writeFileSync(join(outDir, doc.file), bytes);
    writeFileSync(join(publicDir, doc.file), bytes);
    console.log(`wrote samples/${doc.file} and public/samples/${doc.file} (${doc.pages.length} pages)`);
  }
  writeFileSync(join(fixtureDir, "image-only.pdf"), await buildImageOnly());
  writeFileSync(join(fixtureDir, "malformed.pdf"), Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog garbage that is not a real pdf\n%%EOF\n"));
  writeFileSync(join(fixtureDir, "not-a-pdf.pdf"), Buffer.from("This is a plain text file pretending to be a PDF.\n"));
  console.log("wrote tests/fixtures/{image-only,malformed,not-a-pdf}.pdf");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
