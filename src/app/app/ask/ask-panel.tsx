"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AnswerCard } from "@/components/answer-card";
import { BearReading } from "@/components/cabinet/animals";
import { Peeker } from "@/components/cabinet/peeker";
import { Icon } from "@/components/cabinet/illustrations";
import type { QaAnswer } from "@/lib/qa/types";
import type { ThreadMessage } from "@/lib/qa/service";
import { looksLikeIncident } from "@/lib/claims/incident";

const MAX_CHARS = 500;

/** Ask about your cover: pick a policy (or all), ask in plain words, get answers with the wording and page. */
export function AskPanel({
  policies,
  policyId,
  initialThreadId,
  initialMessages,
  suggestions,
  initialQuestion = "",
  embedded = false,
  claimId = null,
}: {
  /** Inside a claim file: questions are about that claim (its policy, with the claim's details). */
  claimId?: string | null;
  /** Prefilled (not sent) question, e.g. from a Review card's "Ask Cabinet". */
  initialQuestion?: string;
  /** Inside a policy's Ask tab: the policy is fixed, so there's no policy picker. */
  embedded?: boolean;
  policies: { id: string; name: string }[];
  policyId: string | null;
  initialThreadId: string | null;
  initialMessages: ThreadMessage[];
  suggestions: string[];
}) {
  const [threadId, setThreadId] = useState(initialThreadId);
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState(initialQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const localId = useRef(0); // ids for messages shown before the server round-trip

  const toEnd = () => requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));

  async function ask(q: string) {
    const text = q.trim();
    if (text.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    const pending: ThreadMessage = { id: `local-${++localId.current}`, role: "user", content: text, answer: null, created_at: "" };
    setMessages((m) => [...m, pending]);
    setQuestion("");
    toEnd();
    const res = await fetch("/api/qa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: text, policyId, threadId, claimId }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessages((m) => m.filter((x) => x.id !== pending.id));
      setQuestion(text);
      setError(body.error ?? "Something went wrong. Please try again.");
      return;
    }
    const answer = body.answer as QaAnswer;
    setThreadId(body.threadId);
    setAnswered((n) => n + 1);
    setMessages((m) => [
      ...m,
      { id: `local-${++localId.current}`, role: "assistant", content: answer.answer, answer, created_at: "" },
    ]);
    toEnd();
  }

  const Heading = embedded ? "h2" : "h1";

  const chip = (active: boolean) =>
    `cab-press shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
      active ? "bg-ink text-paper" : "bg-surface text-ink-soft shadow-sm hover:text-ink"
    }`;

  return (
    <div className="pb-44">
      {!embedded && (
        <nav aria-label="Which policy" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Link href="/app/ask" className={chip(policyId === null)}>
            All policies
          </Link>
          {policies.map((p) => (
            <Link key={p.id} href={`/app/ask?policy=${p.id}`} className={`${chip(policyId === p.id)} max-w-[14rem] truncate`}>
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      {messages.length === 0 && (
        <div className={`cab-rise flex flex-col items-center text-center ${embedded ? "mt-6" : "mt-10"}`}>
          <BearReading className={embedded ? "h-28 w-auto" : "h-40 w-auto"} />
          <Heading className="font-display mt-6 text-[28px] font-normal leading-tight tracking-tight text-ink">What would you like to know?</Heading>
          <div className="mt-7 flex w-full max-w-md flex-col gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => ask(s)}
                className="cab-press rounded-2xl bg-surface px-4 py-3 text-left text-[14px] text-ink shadow-sm transition-shadow hover:shadow disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-5" aria-live="polite">
        {messages.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={m.id} className="ml-auto w-fit max-w-[85%] rounded-[20px] rounded-br-md bg-ink px-4 py-3 text-[15px] leading-relaxed text-paper">
                {m.content}
              </div>
            );
          }
          if (!m.answer) return null;
          // Describing something that happened? Offer to keep it in a claim file (not inside a claim file).
          const asked = messages[i - 1]?.role === "user" ? messages[i - 1].content : "";
          const offer = !claimId && looksLikeIncident(asked);
          return (
            <div key={m.id}>
              <AnswerCard answer={m.answer} onAsk={ask} />
              {offer && (
                <Link
                  href={`/app/claims/new?describe=${encodeURIComponent(asked.slice(0, 1000))}${policyId ? `&policy=${policyId}` : ""}`}
                  className="mt-2 inline-flex items-center gap-1.5 px-1 text-sm font-medium text-ink-soft hover:text-ink"
                >
                  <Icon.Doc className="h-4 w-4" /> Start a claim file
                </Link>
              )}
            </div>
          );
        })}
        {busy && (
          <div className="flex w-fit items-center gap-3 rounded-[20px] rounded-tl-md bg-surface px-4 py-3 text-sm text-ink-soft shadow-sm">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
            Checking your policy…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-paper via-paper/95 to-paper/0 pt-8"
      >
        <div className="mx-auto max-w-2xl px-4 pb-4 sm:px-6">
          {error && (
            <p role="alert" className="mb-2 rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          {/* Once you're chatting, the bear sits on the question box (it reads alongside you). */}
          <div className="relative">
          {messages.length > 0 && (
            <Peeker
              animal="bear"
              className="right-16"
              say={busy ? "Let me look…" : answered ? "Here you go." : null}
              sayKey={busy ? -answered - 1 : answered}
              phrases={["Ask me anything about your policy.", "I'll show you the page.", "Short questions work best."]}
            />
          )}
          <div className="relative z-10 flex items-center gap-2 rounded-full bg-surface py-2 pl-5 pr-2 shadow-[0_1px_2px_rgba(21,23,28,0.06),0_12px_30px_-18px_rgba(21,23,28,0.35)]">
            <input
              id="question"
              value={question}
              maxLength={MAX_CHARS}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your cover…"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              type="submit"
              aria-label="Ask"
              disabled={busy || question.trim().length < 3}
              className="cab-press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-paper transition-opacity disabled:opacity-30"
            >
              <Icon.ArrowUp className="h-5 w-5" />
            </button>
          </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-ink-faint">Information only — not insurance advice or a promise a claim will be paid.</p>
        </div>
      </form>
    </div>
  );
}
