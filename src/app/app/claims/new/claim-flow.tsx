"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HedgehogReading } from "@/components/cabinet/animals";
import { Icon } from "@/components/cabinet/illustrations";
import { Contacts, Deadlines, NextSteps, PolicySays, SectionLabel, VerdictLine } from "@/components/claim-summary";
import { Checklist } from "@/components/claim-checklist";
import { describeAnswers, remainingQuestions, type Question } from "@/lib/claims/questions";
import { INCIDENT_LABEL, INCIDENT_TYPES, type ClaimAnswers, type ClaimAssessment, type IncidentType, type Triage } from "@/lib/claims/types";

export type PolicyOption = { id: string; name: string };
type Step = "describe" | "questions" | "checking" | "review" | "saving";
type Draft = { policyId: string | null; type: IncidentType; item: string | null; title: string; answers: ClaimAnswers };

const EXAMPLES = ["My phone was stolen from my car yesterday", "I dropped my laptop at home", "The airline lost my suitcase"];
const MAX_CHARS = 1000;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

const chip = (on: boolean) =>
  `cab-press rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors ${on ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-paper-deep"}`;
// On the page background (not inside a card), unselected chips need a surface of their own.
const pageChip = (on: boolean) =>
  `cab-press rounded-full px-4 py-2.5 text-[15px] font-medium transition-colors ${on ? "bg-ink text-paper" : "bg-surface text-ink shadow-sm hover:shadow"}`;
const PRIMARY = "cab-press rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-paper disabled:opacity-40";

/** Prepare a claim in a few taps: what happened, a few questions, what the policy says, then save. */
export function ClaimFlow({
  policies,
  initialPolicyId,
  initialDescription = "",
}: {
  policies: PolicyOption[];
  initialPolicyId: string | null;
  /** What the user already told Ask Cabinet, when they started the claim file from there. */
  initialDescription?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState(initialDescription);
  const [picked, setPicked] = useState<string | null>(initialPolicyId);
  const [draft, setDraft] = useState<Draft>({ policyId: null, type: "other", item: null, title: "", answers: {} });
  const [asked, setAsked] = useState<string[]>([]);
  const [fixing, setFixing] = useState(false);
  const [assessment, setAssessment] = useState<ClaimAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const policyName = policies.find((p) => p.id === draft.policyId)?.name ?? "Choose a policy";
  const remaining = remainingQuestions(draft.type, draft.answers);
  const total = asked.length + remaining.length;

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { triage } = (await post("/api/claims/start", { description, policyId: picked })) as { triage: Triage };
      const next: Draft = { policyId: triage.policy_id, type: triage.incident_type, item: triage.item, title: triage.title, answers: triage.prefilled };
      setDraft(next);
      setAsked([]);
      setFixing(false);
      setStep("questions");
      if (!remainingQuestions(next.type, next.answers).length) await check(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function check(d: Draft) {
    if (!d.policyId) return setError("Choose which policy this is for.");
    setStep("checking");
    setError(null);
    try {
      const r = await post("/api/claims/check", {
        description,
        policyId: d.policyId,
        incident_type: d.type,
        item: d.item,
        title: d.title || INCIDENT_LABEL[d.type],
        answers: d.answers,
      });
      setAssessment(r.assessment);
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
      setStep("questions");
    }
  }

  function answer(id: Question["id"], value: string | string[]) {
    const answers: ClaimAnswers = { ...draft.answers, [id]: value };
    // Where it happened decides the follow-up (a break-in at home, or leaving it unattended when out).
    if (id === "where") {
      delete answers.forced_entry;
      delete answers.unattended;
    }
    const next = { ...draft, answers };
    setDraft(next);
    setAsked([...asked, id]);
    if (!remainingQuestions(next.type, answers).length) check(next);
  }

  function back() {
    if (!asked.length) return setStep("describe");
    const answers = { ...draft.answers };
    delete answers[asked[asked.length - 1] as keyof ClaimAnswers];
    setDraft({ ...draft, answers });
    setAsked(asked.slice(0, -1));
  }

  async function save() {
    if (!assessment || !draft.policyId) return;
    setStep("saving");
    setError(null);
    try {
      const r = await post("/api/claims", {
        description,
        policyId: draft.policyId,
        incident_type: draft.type,
        item: draft.item,
        title: draft.title || INCIDENT_LABEL[draft.type],
        answers: draft.answers,
        assessment,
        confirmed: true,
      });
      router.push(`/app/claims/${r.claimId}?saved=1`);
    } catch (e) {
      setError((e as Error).message);
      setStep("review");
    }
  }

  const errorBox = error && (
    <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );

  // ── 1. What happened? ──
  if (step === "describe") {
    return (
      <div className="cab-rise space-y-6">
        <div className="flex flex-col items-center text-center">
          <HedgehogReading className="h-24 w-auto" />
          <h1 className="font-display mt-4 text-[30px] font-normal leading-tight tracking-tight text-ink">What happened?</h1>
          <p className="mt-1 text-[15px] text-ink-soft">Tell Cabinet in your own words. It helps you prepare; nothing is sent to your insurer.</p>
        </div>
        <div>
          <label htmlFor="what-happened" className="sr-only">
            What happened
          </label>
          <textarea
            id="what-happened"
            value={description}
            maxLength={MAX_CHARS}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. My laptop was stolen from a café yesterday"
            className="w-full resize-none rounded-[22px] bg-surface p-4 text-[16px] leading-relaxed text-ink shadow-sm outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-ink/10"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => setDescription(e)} className="rounded-full bg-paper-deep/70 px-3 py-1.5 text-[13px] text-ink-soft hover:text-ink">
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <SectionLabel>Which policy?</SectionLabel>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Which policy">
            <button type="button" aria-pressed={picked === null} onClick={() => setPicked(null)} className={pageChip(picked === null)}>
              Not sure
            </button>
            {policies.map((p) => (
              <button key={p.id} type="button" aria-pressed={picked === p.id} onClick={() => setPicked(p.id)} className={`${pageChip(picked === p.id)} max-w-[18rem] truncate`}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        {errorBox}
        <div className="flex justify-center">
          <button type="button" onClick={start} disabled={busy || description.trim().length < 3} className={PRIMARY}>
            {busy ? "Reading…" : "Continue"}
          </button>
        </div>
      </div>
    );
  }

  // ── What Cabinet understood, which the user can correct ──
  const understood = (
    <div className="rounded-[22px] bg-surface p-4 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-semibold text-ink">{draft.title || INCIDENT_LABEL[draft.type]}</p>
          <p className="truncate text-[13px] text-ink-faint">{[policyName, describeAnswers(draft.answers)].filter(Boolean).join(" · ")}</p>
        </div>
        {step === "questions" && (
          <button type="button" onClick={() => setFixing(!fixing)} aria-expanded={fixing} className="shrink-0 text-[13px] font-medium text-ink-soft hover:text-ink">
            {fixing ? "Done" : "Not right?"}
          </button>
        )}
      </div>
      {fixing && step === "questions" && (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <div>
            <SectionLabel>What happened</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={draft.type === t}
                  onClick={() => setDraft({ ...draft, type: t, title: t === draft.type ? draft.title : INCIDENT_LABEL[t] })}
                  className={chip(draft.type === t)}
                >
                  {INCIDENT_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Policy</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {policies.map((p) => (
                <button key={p.id} type="button" aria-pressed={draft.policyId === p.id} onClick={() => setDraft({ ...draft, policyId: p.id })} className={`${chip(draft.policyId === p.id)} max-w-[16rem] truncate`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          {Object.keys(draft.answers).length > 0 && (
            <button type="button" onClick={() => (setDraft({ ...draft, answers: {} }), setAsked([]))} className="text-[13px] font-medium text-ink-soft hover:text-ink">
              Ask me everything again
            </button>
          )}
        </div>
      )}
    </div>
  );

  // ── 2. A few questions, one at a time ──
  if (step === "questions") {
    const q = remaining[0];
    return (
      <div className="space-y-5">
        {understood}
        {errorBox}
        {q ? (
          <QuestionCard key={`${draft.type}-${q.id}`} question={q} index={asked.length} total={total} onAnswer={answer} />
        ) : (
          <div className="flex justify-center">
            <button type="button" onClick={() => check(draft)} className={PRIMARY}>
              Check my policy
            </button>
          </div>
        )}
        <button type="button" onClick={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink">
          <Icon.ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>
    );
  }

  // ── 3. Checking the policy ──
  if (step === "checking" || !assessment) {
    return (
      <div className="cab-rise flex flex-col items-center pt-10 text-center" aria-live="polite">
        <HedgehogReading className="h-28 w-auto" />
        <p className="mt-5 text-[17px] font-semibold text-ink">Checking your policy…</p>
        <p className="mt-1 text-sm text-ink-soft">Cover, exclusions, deadlines and what you&apos;ll need.</p>
      </div>
    );
  }

  // ── 4. Summary to confirm ──
  const toggle = (id: string) =>
    setAssessment({ ...assessment, checklist: assessment.checklist.map((c) => (c.id === id ? { ...c, done: !c.done, done_at: c.done ? null : new Date().toISOString() } : c)) });
  return (
    <div className="space-y-5">
      <h1 className="font-display text-[28px] font-normal leading-tight tracking-tight text-ink">Check and save</h1>
      {understood}
      <section className="space-y-4 rounded-[22px] bg-surface p-5 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
        <VerdictLine assessment={assessment} />
        <PolicySays facts={assessment.facts} />
        <Deadlines deadlines={assessment.deadlines} />
      </section>
      <section className="rounded-[22px] bg-surface p-5 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
        <SectionLabel>Your checklist</SectionLabel>
        <Checklist items={assessment.checklist} onToggle={toggle} />
      </section>
      <section className="space-y-4 px-1">
        <NextSteps steps={assessment.next_steps} />
        <Contacts contacts={assessment.contacts} />
      </section>
      {errorBox}
      <div className="rounded-[22px] bg-paper-deep/60 p-5 text-center">
        <p className="text-[14px] text-ink-soft">Nothing is sent to your insurer. Your claim file keeps the checklist, your evidence and this guidance together.</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={save} disabled={step === "saving"} className={PRIMARY}>
            {step === "saving" ? "Saving…" : "Save claim file"}
          </button>
          <button type="button" onClick={() => (setStep("describe"), setAssessment(null))} className="text-sm font-medium text-ink-soft hover:text-ink">
            Start again
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  question: q,
  index,
  total,
  onAnswer,
}: {
  question: Question;
  index: number;
  total: number;
  onAnswer: (id: Question["id"], value: string | string[]) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div className="cab-rise rounded-[22px] bg-surface p-5 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
      <div className="flex items-center gap-1.5" aria-label={`Question ${index + 1} of ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-ink" : i < index ? "w-1.5 bg-ink/40" : "w-1.5 bg-line"}`} />
        ))}
      </div>
      <h2 className="mt-4 text-[20px] font-semibold leading-snug tracking-[-0.01em] text-ink">{q.text}</h2>
      {q.kind === "choice" && (
        <div className="mt-4 flex flex-wrap gap-2">
          {q.options.map((o) => (
            <button key={o.value} type="button" onClick={() => onAnswer(q.id, o.value)} className={chip(false)}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {q.kind === "date" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label htmlFor="claim-date" className="sr-only">
            Date
          </label>
          <input
            id="claim-date"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-full bg-paper px-4 py-2.5 text-[15px] text-ink outline-none focus:ring-2 focus:ring-ink/10"
          />
          <button type="button" disabled={!date || date > today} onClick={() => onAnswer("when", date)} className={PRIMARY.replace("px-6 py-3", "px-5 py-2.5")}>
            Next
          </button>
          <button type="button" onClick={() => onAnswer("when", "unknown")} className="text-sm font-medium text-ink-soft hover:text-ink">
            Not sure
          </button>
        </div>
      )}
      {q.kind === "multi" && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {q.options.map((o) => {
              const on = picked.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== o.value) : [...picked, o.value])}
                  className={`${chip(on)} inline-flex items-center gap-1.5`}
                >
                  {on && <Icon.Check className="h-4 w-4" />}
                  {o.label}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => onAnswer("evidence", picked)} className={`${PRIMARY.replace("px-6 py-3", "px-5 py-2.5")} mt-5`}>
            {picked.length ? "Next" : "Nothing yet"}
          </button>
        </>
      )}
    </div>
  );
}
