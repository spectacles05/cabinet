"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Only allow redirects within the app.
  const next = params.get("next")?.startsWith("/app") ? params.get("next")! : "/app";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === "signup" && !consent) {
      setError("Please confirm you understand how uploaded documents are processed.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { data, error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: firstName.trim() ? { first_name: firstName.trim().slice(0, 40) } : {} },
          });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (mode === "signup" && !data.session) {
      setInfo("Account created. Check your email to confirm it, then sign in.");
      setMode("signin");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  const field = "mt-1.5 w-full rounded-2xl bg-paper px-4 py-3 text-[15px] text-ink outline-none transition-shadow placeholder:text-ink-faint focus:shadow-[0_0_0_2px_var(--brass)]";

  return (
    <form onSubmit={onSubmit} className="relative z-10 space-y-4 rounded-[28px] bg-surface p-6 shadow-[0_1px_2px_rgba(21,23,28,0.05),0_30px_60px_-36px_rgba(21,23,28,0.4)]">
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full bg-paper p-1 text-sm">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-2 font-medium transition-colors ${mode === m ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"}`}
          >
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      {mode === "signup" && (
        <label className="block text-sm">
          <span className="font-medium text-ink">First name</span> <span className="text-ink-faint">(optional)</span>
          <input type="text" autoComplete="given-name" maxLength={40} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={field} />
        </label>
      )}
      <label className="block text-sm">
        <span className="font-medium text-ink">Email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-ink">Password</span>
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={field}
        />
      </label>

      {mode === "signup" && (
        <label className="flex gap-3 text-xs leading-relaxed text-ink-soft">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ink)]" />
          <span>
            I agree to the{" "}
            <a href="/terms" target="_blank" className="underline underline-offset-2">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" className="underline underline-offset-2">
              Privacy policy
            </a>
            , including that text from documents I add is sent to Anthropic to answer my questions.
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}
      {info && <p className="rounded-2xl bg-ok-soft px-4 py-2.5 text-sm text-ok">{info}</p>}

      <button type="submit" disabled={busy} className="cab-press w-full rounded-full bg-ink px-4 py-3.5 text-[15px] font-semibold text-paper disabled:opacity-60">
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}
