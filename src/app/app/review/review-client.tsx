"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InsightRow } from "@/lib/audit/service";
import { formatDate } from "@/lib/format";
import { FolderTab, type FolderRef } from "@/components/cabinet/folder-tab";
import { Icon } from "@/components/cabinet/illustrations";

export type CompareGroup = { folder: FolderRef; quotes: { quote: string; page: number | null; documentId: string | null }[] };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

/** First check: the main button. Afterwards: a quiet "Check again" that reuses saved results if nothing changed. */
export function ReviewButton({ first = false }: { first?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setNote(null);
    try {
      const r = await call("/api/audit", "POST");
      setNote(r.unchanged ? "Up to date" : null);
      router.refresh();
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (first) {
    return (
      <div>
        <button type="button" onClick={run} disabled={busy} className="cab-press rounded-full bg-ink px-7 py-3 text-[15px] font-semibold text-paper disabled:opacity-60">
          {busy ? "Checking…" : "Check my cover"}
        </button>
        {note && (
          <p className="mt-2 text-xs text-ink-faint" aria-live="polite">
            {note}
          </p>
        )}
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" onClick={run} disabled={busy} className="font-medium text-ink-soft underline decoration-ink/20 underline-offset-4 hover:text-ink hover:decoration-ink disabled:opacity-60">
        {busy ? "Checking…" : "Check again"}
      </button>
      {note && <span aria-live="polite">· {note}</span>}
    </span>
  );
}

// How sure a note is, kept from the analysis: settled by the wording, may apply, or can't be checked yet.
function certainty(i: InsightRow): string {
  if (i.certainty === "unverified") return "Can't check yet";
  if (i.insight_type === "possible_overlap") return "Possible overlap";
  if (i.certainty === "confirmed") return "Not covered";
  return "Possible gap";
}

/** The sheet's left margin: the note's number (or a tick once it's sorted). */
const NUM = "pt-[5px] font-mono text-[11px] tabular-nums tracking-wider text-ink-faint";
const ROW = "grid grid-cols-[2rem_1fr] gap-x-3 sm:grid-cols-[2.75rem_1fr]";
const QUIET = "text-[13px] text-ink-faint underline-offset-4 hover:text-ink hover:underline disabled:opacity-50";

/** One note on the sheet: a plain title and its folders. Tap it for why, the policy's own words, and one thing to do. */
export function Note({
  insight: i,
  n,
  folders,
  message,
  compare,
  initiallyOpen = false,
}: {
  insight: InsightRow;
  n: number;
  folders: FolderRef[];
  message?: string;
  compare?: CompareGroup[];
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [panel, setPanel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = i.action;
  const live = i.status === "open" && !i.snoozed_until;
  const settled = i.status !== "open";

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // The one thing to do. Each leads somewhere real: the folder, the wording side by side, a message, or Ask.
  const DO = "group/do inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink";
  const arrow = <Icon.ArrowRight className="h-4 w-4 transition-transform group-hover/do:translate-x-0.5" />;
  let primary: React.ReactNode;
  if (action.kind === "add_document") {
    const folder = folders.find((f) => f.id === action.policy_id) ?? folders[0];
    primary = (
      <Link href={`/app/policies/${action.policy_id}?tab=documents`} className={DO}>
        Add it to the {folder?.label ?? "policy"} folder {arrow}
      </Link>
    );
  } else if (action.kind === "ask") {
    const q = encodeURIComponent(action.question);
    primary = (
      <Link href={action.policy_id ? `/app/ask?policy=${action.policy_id}&q=${q}` : `/app/ask?q=${q}`} className={DO}>
        Ask Cabinet {arrow}
      </Link>
    );
  } else {
    primary = (
      <button type="button" aria-expanded={panel} onClick={() => setPanel(!panel)} className={DO}>
        {action.kind === "compare" ? "Compare the wording" : "Draft a message to your insurer"}
        <Icon.ArrowRight className={`h-4 w-4 transition-transform ${panel ? "rotate-90" : "group-hover/do:translate-x-0.5"}`} />
      </button>
    );
  }

  // The policy's own words, once: the first quoted clause (comparisons show theirs side by side instead).
  const cited = action.kind === "compare" ? undefined : i.evidence.find((e) => e.quote && e.source === "document");
  const citedFolder = cited ? (folders.find((f) => f.id === cited.policy_id) ?? { id: null, type: "other", label: cited.policy_name }) : undefined;

  return (
    <li id={`note-${i.id}`} className="scroll-mt-24 border-b border-line">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`${ROW} group w-full py-5 text-left`}>
        <span className={NUM} aria-hidden="true">
          {settled ? <Icon.Check className="-mt-0.5 h-3.5 w-3.5 text-ok" /> : String(n).padStart(2, "0")}
        </span>
        <span className="flex min-w-0 items-start gap-3">
          <span className="min-w-0 flex-1">
            <span className={`font-display block text-[19px] leading-[1.3] tracking-[-0.01em] ${settled ? "text-ink-soft" : "text-ink"}`}>{i.title}</span>
            <span className="mt-2.5 flex flex-wrap gap-1.5">
              {folders.map((f) => (
                <FolderTab key={f.id ?? f.label} folder={f} />
              ))}
            </span>
          </span>
          <Icon.ArrowRight
            className={`mt-1.5 h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 ${open ? "rotate-90 text-ink" : "group-hover:translate-x-0.5"}`}
          />
        </span>
      </button>

      {open && (
        <div className={`${ROW} cab-rise pb-6`}>
          <span />
          <div className="min-w-0">
            <p className="small-caps !text-[10px] text-ink-faint">{certainty(i)}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{i.explanation}</p>

            {cited?.quote && citedFolder && (
              <figure className="mt-4 border-l border-ink/25 pl-4">
                <blockquote className="font-display text-[15px] italic leading-relaxed text-ink">&ldquo;{cited.quote}&rdquo;</blockquote>
                <figcaption className="mt-2 flex items-center gap-2 text-[12px] text-ink-faint">
                  {/* Which folder it's from, when the note spans more than one. */}
                  {folders.length > 1 && <FolderTab folder={citedFolder} link />}
                  {cited.document_id && cited.page && <PageRef documentId={cited.document_id} page={cited.page} />}
                </figcaption>
              </figure>
            )}

            {live && <div className="mt-5">{primary}</div>}

            {panel && action.kind === "compare" && compare && (
              <div className="mt-4 grid border-y border-line sm:grid-cols-2 sm:divide-x sm:divide-line">
                {compare.map((g, k) => (
                  <figure key={g.folder.id ?? g.folder.label} className={`py-4 sm:px-4 sm:first:pl-0 sm:last:pr-0 ${k > 0 ? "border-t border-line sm:border-t-0" : ""}`}>
                    <figcaption className="flex items-center gap-2">
                      <FolderTab folder={g.folder} link />
                      {g.quotes[0]?.documentId && g.quotes[0].page && <PageRef documentId={g.quotes[0].documentId} page={g.quotes[0].page} />}
                    </figcaption>
                    {g.quotes[0] ? (
                      <blockquote className="font-display mt-2.5 text-[14px] italic leading-relaxed text-ink">&ldquo;{g.quotes[0].quote}&rdquo;</blockquote>
                    ) : (
                      <p className="mt-2.5 text-[13px] text-ink-faint">No wording quoted.</p>
                    )}
                  </figure>
                ))}
              </div>
            )}

            {panel && action.kind === "contact_insurer" && message && (
              <figure className="mt-4 border-l border-ink/25 pl-4">
                <blockquote className="font-display text-[15px] italic leading-relaxed text-ink">{message}</blockquote>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(message);
                    setCopied(true);
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
                >
                  {copied ? <Icon.Check className="h-3.5 w-3.5" /> : <Icon.Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </figure>
            )}

            {error && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1">
              {live && (
                <>
                  <button type="button" disabled={busy} onClick={() => act(() => call(`/api/insights/${i.id}`, "PATCH", { status: "reviewed" }))} className={QUIET}>
                    Mark sorted
                  </button>
                  <button type="button" disabled={busy} onClick={() => act(() => call(`/api/insights/${i.id}/action`, "POST", { remindInDays: 7 }))} className={QUIET}>
                    Remind me next week
                  </button>
                  <button type="button" disabled={busy} onClick={() => act(() => call(`/api/insights/${i.id}`, "PATCH", { status: "dismissed" }))} className={QUIET}>
                    Not relevant
                  </button>
                </>
              )}
              {i.status === "open" && i.snoozed_until && i.action_item_id && (
                <>
                  <span className="text-[13px] text-ink-faint">Back on {formatDate(i.snoozed_until)}</span>
                  <button type="button" disabled={busy} onClick={() => act(() => call(`/api/actions/${i.action_item_id}`, "PATCH", { completed: true }))} className={QUIET}>
                    Bring back now
                  </button>
                </>
              )}
              {settled && (
                <button type="button" disabled={busy} onClick={() => act(() => call(`/api/insights/${i.id}`, "PATCH", { status: "open" }))} className={QUIET}>
                  Reopen
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/** A small page reference that opens the document at that page. */
function PageRef({ documentId, page }: { documentId: string; page: number }) {
  return (
    <a
      href={`/api/documents/${documentId}/file?page=${page}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open page ${page}`}
      className="font-mono text-[11px] tracking-wider text-ink-faint underline decoration-ink/20 underline-offset-[3px] hover:text-ink hover:decoration-ink"
    >
      p.{page}
    </a>
  );
}

/**
 * A finding that only matters to some people is pencilled in as a question first, answered with a tick.
 * "No" retires it; "Yes" turns it into a note.
 */
export function Annotation({ insight: i, n, folders }: { insight: InsightRow; n: number; folders: FolderRef[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function answer(relevant: boolean) {
    setChosen(relevant);
    setError(null);
    try {
      await call(`/api/insights/${i.id}`, "PATCH", { relevant });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setChosen(null);
    }
  }
  const tick = (value: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={chosen === value}
      disabled={chosen !== null}
      onClick={() => answer(value)}
      className="group/tick inline-flex items-center gap-2 py-1 text-[14px] text-ink disabled:cursor-default"
    >
      <span className={`grid h-[15px] w-[15px] place-items-center rounded-[3px] border transition-colors ${chosen === value ? "border-ink bg-ink text-paper" : "border-ink/40 group-hover/tick:border-ink"}`}>
        {chosen === value && <Icon.Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </button>
  );
  return (
    <li id={`note-${i.id}`} className={`${ROW} border-b border-line py-5`}>
      <span className={NUM} aria-hidden="true">
        {String(n).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <p id={`q-${i.id}`} className="font-display text-[19px] italic leading-[1.3] text-ink">
          {i.relevance_question}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex flex-wrap gap-1.5">
            {folders.map((f) => (
              <FolderTab key={f.id ?? f.label} folder={f} />
            ))}
          </span>
          <span role="radiogroup" aria-labelledby={`q-${i.id}`} className="flex items-center gap-5">
            {tick(true, "Yes")}
            {tick(false, "No")}
          </span>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </li>
  );
}
