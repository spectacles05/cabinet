import { getUser } from "@/lib/supabase/server";
import { Icon } from "@/components/cabinet/illustrations";

export const metadata = { title: "Run history — Cabinet" };

const WORKFLOW: Record<string, string> = {
  ingest: "Upload & read PDF",
  extract: "Extract policy details",
  qa: "Answer a question",
  audit: "Coverage review",
  action: "User-approved action",
  claim: "Claim preparation",
};

const STATUS: Record<string, { dot: string; text: string }> = {
  succeeded: { dot: "bg-ok", text: "text-ok" },
  abstained: { dot: "bg-brass", text: "text-[#7a5a1f]" },
  failed: { dot: "bg-danger", text: "text-danger" },
  running: { dot: "bg-ink-faint", text: "text-ink-soft" },
  skipped: { dot: "bg-ink-faint", text: "text-ink-soft" },
};

/**
 * Run history for judges and the team: every step the service ran for this account, redacted at source.
 * It isn't in any customer menu (linked only from the Demo tools in Profile); on the live site judges
 * reach it at /app/runs. Each person only ever sees their own log, which is also exportable at /api/runs/export.
 */
export default async function RunsPage({ searchParams }: PageProps<"/app/runs">) {
  const { workflow } = await searchParams;
  const { supabase } = await getUser();
  let q = supabase.from("agent_runs").select("id, workflow, status, started_at, completed_at").order("started_at", { ascending: false }).limit(50);
  if (typeof workflow === "string" && WORKFLOW[workflow]) q = q.eq("workflow", workflow);
  const { data: runs } = await q;
  const ids = (runs ?? []).map((r) => r.id);
  const { data: steps } = ids.length
    ? await supabase.from("agent_steps").select("run_id, step_name, status, duration_ms, metadata, created_at").in("run_id", ids).order("created_at")
    : { data: [] };

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${active ? "bg-ink text-paper" : "bg-surface text-ink-soft shadow-sm hover:text-ink"}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="font-display text-[30px] font-normal tracking-tight text-ink">Run history</h1>
          <p className="mt-1 max-w-md text-[14px] leading-relaxed text-ink-soft">
            Every step the service ran for this account. Logs never hold policy text, names, policy numbers or questions.
          </p>
        </div>
        <a href="/api/runs/export" className="cab-press rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink shadow-sm hover:shadow">
          Download log
        </a>
      </header>

      <nav className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Filter by workflow">
        <a href="/app/runs" className={chip(!workflow)}>
          All
        </a>
        {Object.entries(WORKFLOW).map(([k, label]) => (
          <a key={k} href={`/app/runs?workflow=${k}`} className={chip(workflow === k)}>
            {label}
          </a>
        ))}
      </nav>

      {(runs ?? []).length === 0 && <p className="px-1 text-sm text-ink-soft">Nothing yet.</p>}

      {(runs ?? []).length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
          {(runs ?? []).map((r) => {
            const own = (steps ?? []).filter((s) => s.run_id === r.id);
            const ms = r.completed_at ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime() : null;
            const st = STATUS[r.status] ?? STATUS.running;
            return (
              <li key={r.id}>
                <details className="group/run">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition-colors hover:bg-paper/50 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-ink">{WORKFLOW[r.workflow] ?? r.workflow}</span>
                      <span className="block text-xs text-ink-faint">
                        {new Date(r.started_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        {ms !== null ? ` · ${(ms / 1000).toFixed(1)}s` : ""} · {own.length} step{own.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className={`text-xs font-medium capitalize ${st.text}`}>{r.status}</span>
                    <Icon.Chevron className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-open/run:rotate-90" />
                  </summary>
                  <ol className="space-y-3 border-t border-line bg-paper/40 px-5 py-4">
                    {own.map((s, n) => {
                      const ss = STATUS[s.status] ?? STATUS.running;
                      return (
                        <li key={n} className="text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ss.dot}`} />
                            <code className="text-[13px] text-ink">{s.step_name}</code>
                            <span className={`text-xs ${ss.text}`}>{s.status}</span>
                            <span className="text-xs text-ink-faint">{s.duration_ms} ms</span>
                          </div>
                          {Object.keys(s.metadata ?? {}).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1 pl-3.5">
                              {Object.entries(s.metadata as Record<string, unknown>).map(([k, v]) => (
                                <span key={k} className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                                  {k}={String(v).length > 20 ? `${String(v).slice(0, 8)}…` : String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
