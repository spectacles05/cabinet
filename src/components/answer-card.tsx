"use client";

import { useState } from "react";
import { DEFAULT_HEADLINE, type QaAnswer } from "@/lib/qa/types";
import { Icon } from "@/components/cabinet/illustrations";
import { PageLink, Quote } from "@/components/evidence";
import { DemoBadge } from "@/components/cabinet/mode-controls";

// The verdict as a small coloured mark beside the conclusion. Plain facts don't get one.
const VERDICT: Partial<Record<QaAnswer["assessment"], { label: string; className: string; icon: keyof typeof Icon }>> = {
  covered: { label: "Covered", className: "bg-ok-soft text-ok", icon: "Check" },
  excluded: { label: "Not covered", className: "bg-danger-soft text-danger", icon: "Ban" },
  conditional: { label: "Covered, with conditions", className: "bg-brass-soft text-[#7a5a1f]", icon: "Alert" },
  insufficient_evidence: { label: "Can't confirm", className: "bg-paper-deep text-ink-soft", icon: "Question" },
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^[a-z]?\d+(\.\d+)*\s+/, "")
    .replace(/gbp\s?/g, "£")
    .replace(/[^a-z0-9£]+/g, " ")
    .trim();

/**
 * One reply: the conclusion first, a short why, the conditions that could change the outcome, and
 * at most one next step. The exact wording sits behind "Evidence", with the pages always in view.
 */
export function AnswerCard({ answer, onAsk }: { answer: QaAnswer; onAsk?: (question: string) => void }) {
  const [open, setOpen] = useState(false);
  const verdict = VERDICT[answer.assessment];
  const VerdictIcon = verdict ? Icon[verdict.icon] : null;

  // Replies saved before conclusions were separate: lead with the verdict, keep the long lists folded away.
  const legacy = answer.headline === undefined;
  const headline = legacy ? (answer.assessment === "information" ? "" : DEFAULT_HEADLINE[answer.assessment]) : (answer.headline ?? "");
  const mustKnow = legacy ? [] : answer.conditions;
  const more = legacy ? [...answer.conditions, ...answer.further_checks] : answer.further_checks;

  // Demo Mode's "only prepared questions" reply suggests prepared questions: make them tappable.
  const tryAsking = answer.engine === "demo" && answer.citations.length === 0 && onAsk ? answer.further_checks.filter((q) => q.endsWith("?")) : [];
  const extra = tryAsking.length ? [] : more;
  const pages = answer.citations.filter((c, i, all) => all.findIndex((x) => x.document_id === c.document_id && x.page === c.page) === i);
  // Don't repeat wording that's already quoted in the reply itself.
  const shown = norm([headline, answer.answer, ...mustKnow].join(" "));
  const quotes = answer.citations.filter((c) => !shown.includes(norm(c.quote).slice(0, 80)));
  const hasEvidence = quotes.length > 0 || extra.length > 0;

  return (
    <div className="cab-rise rounded-[22px] rounded-tl-md bg-surface p-5 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
      {headline && (
        <div className="flex items-start gap-3">
          {verdict && VerdictIcon && (
            <span title={verdict.label} className={`mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full ${verdict.className}`}>
              <VerdictIcon className="h-4 w-4" />
              <span className="sr-only">{verdict.label}: </span>
            </span>
          )}
          <p className="min-w-0 pt-0.5 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">{headline}</p>
        </div>
      )}

      {answer.answer && <p className={`text-[15px] leading-relaxed ${headline ? "mt-2 text-ink-soft" : "text-ink"}`}>{answer.answer}</p>}

      {mustKnow.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label="Worth knowing">
          {mustKnow.map((c, i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-ink">
              <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brass" />
              {c}
            </li>
          ))}
        </ul>
      )}

      {answer.next_step && (
        <p className="mt-3 flex items-start gap-2 text-[14px] font-medium leading-snug text-ink">
          <Icon.ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
          <span>
            <span className="sr-only">Next step: </span>
            {answer.next_step}
          </span>
        </p>
      )}

      {tryAsking.length > 0 && (
        <div className="mt-3 flex flex-col items-start gap-2">
          {tryAsking.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onAsk?.(q)}
              className="cab-press rounded-2xl bg-paper px-3.5 py-2 text-left text-[14px] text-ink transition-colors hover:bg-paper-deep"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {(pages.length > 0 || hasEvidence || answer.engine === "demo") && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {pages.map((c) => (
            <PageLink key={`${c.document_id}-${c.page}`} documentId={c.document_id} page={c.page} />
          ))}
          {answer.engine === "demo" && <DemoBadge />}
          {hasEvidence && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-ink-soft hover:text-ink"
            >
              {open ? "Hide evidence" : "Evidence"}
              <Icon.Chevron className={`h-3.5 w-3.5 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
            </button>
          )}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          {quotes.map((c, i) => (
            <figure key={i} className="space-y-1.5">
              <Quote text={c.quote} />
              <figcaption className="flex items-center gap-2 pl-3 text-[12px] text-ink-faint">
                <span className="truncate">{c.policy_name ?? "Your policy"}</span>
                <PageLink documentId={c.document_id} page={c.page} />
              </figcaption>
            </figure>
          ))}
          {extra.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Also worth knowing</p>
              <ul className="mt-2 space-y-1.5">
                {extra.map((c, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-soft">
                    <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
