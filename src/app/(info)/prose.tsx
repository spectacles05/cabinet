import type { ReactNode } from "react";

/** Shared typography for the info pages: a title, then short question-and-answer style sections. */
export function Page({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article className="cab-rise">
      <h1 className="font-display text-[34px] font-normal leading-tight tracking-tight text-ink">{title}</h1>
      {updated && <p className="mt-2 text-xs text-ink-faint">Last updated {updated}</p>}
      <div className="mt-8 space-y-7">{children}</div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      <div className="mt-1.5 space-y-2 text-[15px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}
