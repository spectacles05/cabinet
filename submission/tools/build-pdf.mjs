// Builds a PDF from a submission Markdown file, with its SVG figures, using Playwright and the
// locally installed Microsoft Edge. Handles the Markdown subset the submission documents use.
// Usage: node submission/tools/build-pdf.mjs submission/technical-documentation.md
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, basename, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const input = resolve(process.argv[2] ?? "submission/technical-documentation.md");
const dir = dirname(input);
const title = basename(input, ".md");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(text) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts
    .map((p) => {
      if (p.startsWith("`") && p.endsWith("`") && p.length > 1) return `<code>${esc(p.slice(1, -1))}</code>`;
      return esc(p)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2">$2</a>');
    })
    .join("");
}

const LIST = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

function cells(row) {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function renderTable(rows) {
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const thead = head.every((h) => !h) ? "" : `<thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join("")}</tr></thead>`;
  return `<table>${thead}<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function renderList(lines) {
  const ordered = /^\d+\./.test(lines[0].trim());
  const items = [];
  for (const line of lines) {
    const m = LIST.exec(line);
    if (m && m[1].length === 0) items.push([m[3]]);
    else items[items.length - 1].push(line.replace(/^ {1,3}/, ""));
  }
  const html = items
    .map((content) => {
      const simple = content.length === 1;
      return `<li>${simple ? inline(content[0]) : renderBlocks(content)}</li>`;
    })
    .join("");
  return ordered ? `<ol>${html}</ol>` : `<ul>${html}</ul>`;
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) {
      out.push("<hr>");
      i++;
      continue;
    }
    const img = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (img) {
      out.push(`<figure><img src="${img[2]}" alt="${esc(img[1])}"></figure>`);
      i++;
      continue;
    }
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]);
      out.push(renderTable(rows));
      continue;
    }
    if (LIST.test(line) && LIST.exec(line)[1].length === 0) {
      const block = [];
      while (i < lines.length) {
        const l = lines[i];
        if (!l.trim()) {
          // A blank line stays in the list only if the list continues after it.
          const next = lines.slice(i + 1).find((x) => x.trim());
          if (next && (/^\s{2,}\S/.test(next) || (LIST.test(next) && LIST.exec(next)[1].length === 0))) {
            block.push(l);
            i++;
            continue;
          }
          break;
        }
        if (/^\s{2,}\S/.test(l) || (LIST.test(l) && LIST.exec(l)[1].length === 0)) {
          block.push(l);
          i++;
          continue;
        }
        break;
      }
      out.push(renderList(block));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\||!\[|---+\s*$)/.test(lines[i]) && !(LIST.test(lines[i]) && LIST.exec(lines[i])[1].length === 0)) {
      para.push(lines[i++].trim());
    }
    const text = para.join(" ");
    out.push(/^\*[^*].*\*$/.test(text) ? `<p class="caption">${inline(text.slice(1, -1))}</p>` : `<p>${inline(text)}</p>`);
  }
  return out.join("\n");
}

const md = readFileSync(input, "utf8").replace(/\r\n/g, "\n");
// The footer names the document from its first heading, e.g. "Cabinet: Technical Documentation".
const docName = (md.match(/^# (.+)$/m)?.[1] ?? "Cabinet").replace(/: /, " · ");
const body = renderBlocks(md.split("\n"));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page { size: A4; margin: 16mm 15mm 18mm; }
  body { font-family: "Segoe UI", Helvetica, Arial, sans-serif; font-size: 9.4pt; line-height: 1.45; color: #15171c; }
  h1 { font-family: Georgia, serif; font-size: 22pt; font-weight: 700; margin: 0 0 4pt; }
  h2 { font-family: Georgia, serif; font-size: 14.5pt; margin: 18pt 0 6pt; padding-top: 6pt; border-top: 1.2pt solid #15171c; break-after: avoid; }
  h3 { font-size: 10.8pt; margin: 12pt 0 4pt; break-after: avoid; }
  h4 { font-size: 10pt; margin: 10pt 0 3pt; }
  p { margin: 4pt 0 6pt; }
  p.caption { font-size: 8.4pt; color: #5d626c; font-style: italic; margin-top: -2pt; }
  ul, ol { margin: 3pt 0 6pt; padding-left: 16pt; }
  li { margin: 1.5pt 0; }
  li > p { margin: 1pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0 9pt; font-size: 8.3pt; line-height: 1.35; }
  th { text-align: left; background: #f4f1ec; font-weight: 700; }
  th, td { border: 0.6pt solid #cfc8bb; padding: 3.5pt 5pt; vertical-align: top; }
  tr { break-inside: avoid; }
  code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 8.2pt; background: #f4f1ec; padding: 0 2pt; border-radius: 2pt; }
  pre { background: #f4f1ec; padding: 7pt 9pt; border-radius: 4pt; font-size: 8.2pt; white-space: pre-wrap; break-inside: avoid; }
  pre code { background: none; padding: 0; }
  figure { margin: 6pt 0 2pt; break-inside: avoid; }
  figure img { width: 100%; border: 0.6pt solid #e2ddd3; }
  hr { border: none; border-top: 0.6pt solid #cfc8bb; margin: 10pt 0; }
  a { color: #15171c; }
  strong { font-weight: 700; }
</style></head><body>${body}</body></html>`;

const htmlPath = join(dir, `.${title}.build.html`);
writeFileSync(htmlPath, html);
const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.pdf({
    path: join(dir, `${title}.pdf`),
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font-family:Segoe UI,Arial,sans-serif;font-size:7.5pt;color:#8f939b;padding:0 15mm;display:flex;justify-content:space-between"><span>${esc(docName)} · 2026 Shenzhen FinTechathon, Topic D</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    margin: { top: "16mm", bottom: "18mm", left: "15mm", right: "15mm" },
  });
} finally {
  await browser.close();
  if (!process.env.KEEP_HTML) rmSync(htmlPath, { force: true });
}
console.log(`Wrote ${join(dir, `${title}.pdf`)}`);
