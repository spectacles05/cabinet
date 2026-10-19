"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Two-step delete: the first click explains exactly what will be removed, the second confirms. */
export function DeleteButton({
  url,
  label,
  warning,
  redirectTo,
}: {
  url: string;
  label: string;
  warning: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Delete failed.");
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-sm font-medium text-danger/90 underline-offset-4 hover:underline">
        {label}
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label="Confirm delete" className="cab-rise w-full rounded-[20px] bg-danger-soft p-4 text-sm">
      <p className="leading-relaxed text-danger">{warning}</p>
      {error && <p className="mt-1 font-medium text-danger">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={remove} disabled={busy} className="cab-press rounded-full bg-danger px-4 py-2 font-semibold text-white disabled:opacity-50">
          {busy ? "Deleting…" : "Yes, delete permanently"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="font-medium text-ink-soft hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
