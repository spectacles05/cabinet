"use client";

import { Icon } from "@/components/cabinet/illustrations";
import { PageLink } from "@/components/evidence";
import type { ChecklistItem } from "@/lib/claims/types";

/**
 * Tick-off list: what the policy asks for (with its page) and a few suggestions. On a saved claim
 * file, items you'd keep a copy of get a quiet "Add" that files the document and ticks the item.
 */
export function Checklist({
  items,
  onToggle,
  busyId,
  onAttach,
  canAttach,
}: {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  busyId?: string | null;
  onAttach?: (item: ChecklistItem) => void;
  canAttach?: (item: ChecklistItem) => boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 py-2.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={c.done}
            aria-label={c.label}
            disabled={busyId === c.id}
            onClick={() => onToggle(c.id)}
            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors disabled:opacity-50 ${c.done ? "border-ok bg-ok text-white" : "border-line hover:border-ink-faint"}`}
          >
            {c.done && <Icon.Check className="h-3.5 w-3.5" />}
          </button>
          <span className={`min-w-0 flex-1 text-[15px] ${c.done ? "text-ink-faint line-through" : "text-ink"}`}>{c.label}</span>
          {onAttach && !c.done && canAttach?.(c) && (
            <button
              type="button"
              disabled={busyId === c.id}
              onClick={() => onAttach(c)}
              aria-label={`Add a file for: ${c.label}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-[12px] font-medium text-ink-soft hover:text-ink disabled:opacity-50"
            >
              <Icon.Plus className="h-3.5 w-3.5" /> {busyId === c.id ? "Adding…" : "Add"}
            </button>
          )}
          {c.citation ? <PageLink documentId={c.citation.document_id} page={c.citation.page} /> : <span className="text-[12px] text-ink-faint">Suggested</span>}
        </li>
      ))}
    </ul>
  );
}
