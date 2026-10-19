// Pieces of a claim summary, shared by the confirm step and the saved claim. Confirmed policy facts
// carry their page; anything not confirmed says so.
import type { ClaimAssessment, ClaimContact, ClaimDeadline, ClaimFact } from "@/lib/claims/types";
import { formatDate } from "@/lib/format";
import { Icon } from "@/components/cabinet/illustrations";
import { PageLink } from "@/components/evidence";
import { DemoBadge } from "@/components/cabinet/mode-controls";

const VERDICT: Record<ClaimAssessment["verdict"], { className: string; icon: keyof typeof Icon; label: string }> = {
  likely_covered: { className: "bg-ok-soft text-ok", icon: "Check", label: "Looks covered" },
  conditional: { className: "bg-brass-soft text-[#7a5a1f]", icon: "Alert", label: "Depends on conditions" },
  likely_not_covered: { className: "bg-danger-soft text-danger", icon: "Ban", label: "Doesn't look covered" },
  unclear: { className: "bg-paper-deep text-ink-soft", icon: "Question", label: "Can't confirm" },
};

export function VerdictLine({ assessment }: { assessment: ClaimAssessment }) {
  const v = VERDICT[assessment.verdict];
  const I = Icon[v.icon];
  return (
    <div className="flex items-start gap-3">
      <span title={v.label} className={`mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full ${v.className}`}>
        <I className="h-4 w-4" />
        <span className="sr-only">{v.label}: </span>
      </span>
      <p className="min-w-0 pt-0.5 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">{assessment.headline}</p>
      {assessment.engine === "demo" && <DemoBadge />}
    </div>
  );
}

export function PolicySays({ facts }: { facts: ClaimFact[] }) {
  if (!facts.length) return null;
  return (
    <ul className="space-y-2" aria-label="What your policy says">
      {facts.map((f, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[14px] leading-relaxed">
          {f.certainty === "confirmed" ? (
            <Icon.Check className="mt-[3px] h-4 w-4 shrink-0 text-ok" />
          ) : (
            <Icon.Question className="mt-[3px] h-4 w-4 shrink-0 text-ink-faint" />
          )}
          <span className={`min-w-0 flex-1 ${f.certainty === "confirmed" ? "text-ink" : "text-ink-soft"}`}>
            {f.text}
            {f.certainty === "uncertain" && <span className="ml-1.5 text-[12px] text-ink-faint">Not confirmed</span>}
          </span>
          {f.citation && <PageLink documentId={f.citation.document_id} page={f.citation.page} />}
        </li>
      ))}
    </ul>
  );
}

/** "Report it to the police within 48 hours · by 16 Oct", with a nudge if that day has passed. */
export function Deadlines({ deadlines, today = new Date().toISOString().slice(0, 10) }: { deadlines: ClaimDeadline[]; today?: string }) {
  if (!deadlines.length) return null;
  // Up to two days in hours, as policies usually put it ("within 48 hours"); longer in days.
  const span = (h: number) => (h % 24 === 0 && h >= 72 ? `${h / 24} days` : `${h} hours`);
  return (
    <ul className="space-y-2" aria-label="Deadlines">
      {deadlines.map((d, i) => {
        const passed = d.due_date !== null && d.due_date < today;
        return (
          <li key={i} className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-[14px] ${passed ? "bg-danger-soft" : "bg-brass-soft/60"}`}>
            <Icon.Clock className={`mt-[3px] h-4 w-4 shrink-0 ${passed ? "text-danger" : "text-[#7a5a1f]"}`} />
            <span className="min-w-0 flex-1 text-ink">
              <span className="font-medium">{d.action}</span> within {span(d.hours)}
              {d.due_date && <span className="text-ink-soft"> · by {formatDate(d.due_date)?.replace(/ \d{4}$/, "")}</span>}
              {passed && <span className="block text-[13px] text-danger">This may have passed. Do it as soon as you can and tell your insurer.</span>}
            </span>
            {d.citation && <PageLink documentId={d.citation.document_id} page={d.citation.page} />}
          </li>
        );
      })}
    </ul>
  );
}

export function Contacts({ contacts }: { contacts: ClaimContact[] }) {
  if (!contacts.length) return <p className="text-[13px] text-ink-faint">No claims phone number or email is in your documents.</p>;
  return (
    <ul className="space-y-1.5" aria-label="Contacts">
      {contacts.map((c, i) => (
        <li key={i} className="flex items-center gap-2 text-[14px]">
          <span className="text-ink-soft">{c.label}</span>
          <a href={/@/.test(c.value) ? `mailto:${c.value}` : `tel:${c.value.replace(/[^\d+]/g, "")}`} className="font-medium text-ink underline-offset-4 hover:underline">
            {c.value}
          </a>
          {c.citation ? <PageLink documentId={c.citation.document_id} page={c.citation.page} /> : <span className="text-[12px] text-ink-faint">Added by you</span>}
        </li>
      ))}
    </ul>
  );
}

export function NextSteps({ steps }: { steps: string[] }) {
  if (!steps.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Next steps">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-[14px] font-medium leading-snug text-ink">
          <Icon.ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-brass" />
          {s}
        </li>
      ))}
    </ul>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{children}</p>;
}
