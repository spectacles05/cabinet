"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ROW = "flex items-center gap-4 px-5 py-3.5";

/** Your name (used in the greeting) and your sign-in email. */
export function ProfileForm({ firstName, email }: { firstName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(firstName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const changed = name.trim() !== firstName;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().auth.updateUser({ data: { first_name: name.trim().slice(0, 40) || null } });
    setBusy(false);
    if (error) return setMessage("We couldn't save that. Please try again.");
    setMessage("Saved");
    router.refresh();
  }

  return (
    <form onSubmit={save}>
      <div className="divide-y divide-line overflow-hidden rounded-[22px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
        <div className={`${ROW} focus-within:bg-paper/60`}>
          <label htmlFor="first-name" className="w-24 shrink-0 text-[14px] text-ink-soft">
            First name
          </label>
          <input
            id="first-name"
            value={name}
            maxLength={40}
            autoComplete="given-name"
            placeholder="Add your name"
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          {changed && (
            <button type="submit" disabled={busy} className="cab-press rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-paper disabled:opacity-60">
              {busy ? "Saving…" : "Save"}
            </button>
          )}
        </div>
        <div className={ROW}>
          <span className="w-24 shrink-0 text-[14px] text-ink-soft">Email</span>
          <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{email}</span>
        </div>
      </div>
      {message && (
        <p className="mt-2 px-1 text-xs text-ink-faint" aria-live="polite">
          {message}
        </p>
      )}
    </form>
  );
}
