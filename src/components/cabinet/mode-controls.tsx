"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppMode } from "@/lib/ai/mode";
import { Icon } from "./illustrations";

/** A small badge while answers and readings are prepared (Demo Mode) rather than live. */
export function DemoBadge() {
  return (
    <span
      title="Demo Mode: prepared answers about the sample policies"
      className="rounded-full bg-brass-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a5a1f]"
    >
      Demo
    </span>
  );
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

const ROW = "flex items-center justify-between gap-4 px-5 py-3.5";

/** Profile: the Demo / Live AI switch (when this site allows switching), Reset demo, and the team-only run history. */
export function DemoTools({ mode, switchable }: { mode: AppMode; switchable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: string, fn: () => Promise<unknown>, then?: () => void) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      then?.();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      setConfirmReset(false);
    }
  }

  return (
    <div>
      <div className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
        <div className={ROW}>
          <span className="text-[14px] text-ink-soft">Mode</span>
          {switchable ? (
            <div role="radiogroup" aria-label="Mode" className="grid grid-cols-2 gap-1 rounded-full bg-paper p-1 text-xs font-medium">
              {(["demo", "live"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={busy !== null}
                  onClick={() => mode !== m && run("mode", () => post("/api/mode", { mode: m }))}
                  className={`rounded-full px-3 py-1.5 transition-colors ${mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
                >
                  {m === "demo" ? "Demo" : "Live AI"}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[15px] font-medium text-ink">{mode === "demo" ? "Demo" : "Live AI"}</span>
          )}
        </div>
        {mode === "demo" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => (confirmReset ? run("reset", () => post("/api/demo/reset", {}), () => router.push("/app")) : setConfirmReset(true))}
            className={`${ROW} w-full text-left text-[15px] disabled:opacity-60 ${confirmReset ? "bg-danger-soft text-danger" : "text-ink hover:bg-paper/60"}`}
          >
            {busy === "reset" ? "Resetting…" : confirmReset ? "Tap again to reset everything" : "Reset demo data"}
            <Icon.Chevron className="h-4 w-4 text-ink-faint" />
          </button>
        )}
        <Link href="/app/runs" className={`${ROW} text-[15px] text-ink hover:bg-paper/60`}>
          Run history
          <Icon.Chevron className="h-4 w-4 text-ink-faint" />
        </Link>
      </div>
      <p className="mt-2 px-1 text-xs text-ink-faint">
        {error ?? "Demo answers prepared questions about the sample policies, at no cost. Live AI reads any policy and answers anything."}
      </p>
    </div>
  );
}
