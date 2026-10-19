// Small presentational pieces for showing where a fact came from.

/** A small "p.4" chip that opens the PDF at that page. */
export function PageLink({ documentId, page }: { documentId: string; page: number | null }) {
  if (!page) return null;
  return (
    <a
      href={`/api/documents/${documentId}/file?page=${page}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open page ${page}`}
      title={`Open page ${page} of the document`}
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-paper-deep/70 px-2 py-0.5 text-[11px] font-medium text-ink-soft transition-colors hover:bg-ink hover:text-paper"
    >
      p.{page}
    </a>
  );
}

/** True when the quote adds nothing beyond the displayed text (e.g. rule-based summaries are the clause itself). */
export function quoteRepeats(display: string, quote: string | null): boolean {
  if (!quote) return true;
  const norm = (s: string) => s.replace(/…$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  const d = norm(display);
  const q = norm(quote);
  return d === q || q.startsWith(d) || d.startsWith(q);
}

/** The exact wording from the document, set apart with a fine brass rule. */
export function Quote({ text, clamp = false }: { text: string | null; clamp?: boolean }) {
  if (!text) return null;
  return (
    <q title={clamp ? text : undefined} className={`border-l-2 border-brass/40 pl-3 text-[13px] italic leading-relaxed text-ink-soft ${clamp ? "line-clamp-3" : "block"}`}>
      {text}
    </q>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    found: ["Found in document", "bg-ok-soft text-ok"],
    needs_confirmation: ["Needs a check", "bg-brass-soft text-[#7a5a1f]"],
    ambiguous: ["Unclear in document", "bg-brass-soft text-[#7a5a1f]"],
    not_found: ["Not found", "bg-paper-deep text-ink-soft"],
    edited: ["Edited by you", "bg-ink/[0.07] text-ink"],
  };
  const [label, cls] = map[status] ?? [status, "bg-paper-deep text-ink-soft"];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}
