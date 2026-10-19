"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ExtractButton({
  documentId,
  disabled,
  label = "Read it now",
  secondary = false,
}: {
  documentId: string;
  disabled?: boolean;
  label?: string;
  secondary?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "We couldn't read it this time. Please try again.");
    router.refresh();
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className={
          secondary
            ? "text-sm font-medium text-ink-soft underline underline-offset-4 hover:text-ink disabled:opacity-50"
            : "cab-press rounded-full bg-ink px-7 py-3 text-[15px] font-semibold text-paper disabled:opacity-50"
        }
      >
        {busy ? "Reading… (up to a minute)" : label}
      </button>
      {error && (
        <p role="alert" className="mx-auto mt-3 max-w-sm rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
