"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/cabinet/illustrations";
import type { ClaimAnswers, IncidentType } from "@/lib/claims/types";

const WHERE: { value: NonNullable<ClaimAnswers["where"]>; label: string }[] = [
  { value: "home", label: "At home" },
  { value: "away", label: "Out and about" },
  { value: "abroad", label: "Abroad" },
  { value: "vehicle", label: "In a car" },
];
const chip = (on: boolean) =>
  `cab-press rounded-full px-3.5 py-2 text-[14px] font-medium transition-colors ${on ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-paper-deep"}`;

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** What happened: shown plainly, edited in place with a normal Save. */
export function ClaimDetails({
  claimId,
  title,
  description,
  incidentType,
  answers,
  startEditing = false,
}: {
  claimId: string;
  title: string;
  description: string;
  incidentType: IncidentType;
  answers: ClaimAnswers;
  startEditing?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(startEditing);
  const [form, setForm] = useState({
    title,
    description,
    unknownDate: !answers.when || answers.when === "unknown",
    date: answers.when && answers.when !== "unknown" ? answers.when : new Date().toISOString().slice(0, 10),
    where: answers.where ?? null,
    forced_entry: answers.forced_entry ?? null,
    unattended: answers.unattended ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const theft = incidentType === "theft";
  const indoors = form.where === "home" || form.where === "vehicle";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/claims/${claimId}`, "PATCH", {
        details: {
          title: form.title,
          description: form.description,
          when: form.unknownDate ? "unknown" : form.date,
          where: form.where,
          // Only the follow-up that matches where it happened is kept.
          forced_entry: theft && indoors ? form.forced_entry : null,
          unattended: theft && form.where && !indoors ? form.unattended : null,
        },
      });
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    const where = WHERE.find((w) => w.value === answers.where)?.label;
    const facts = [
      answers.when && answers.when !== "unknown" ? longDate(answers.when) : "Date not known",
      where,
      answers.forced_entry === "yes" ? "Signs of a break-in" : answers.forced_entry === "no" ? "No signs of a break-in" : null,
      answers.unattended === "yes" ? "Left unattended" : answers.unattended === "no" ? "Not left unattended" : null,
      answers.police === "yes" ? "Reported to the police" : null,
    ].filter(Boolean);
    return (
      <section aria-label="What happened" className="px-1">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">What happened</p>
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-soft hover:text-ink">
            <Icon.Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink">{description}</p>
        <p className="mt-1 text-[13px] text-ink-soft">{facts.join(" · ")}</p>
      </section>
    );
  }

  return (
    <section aria-label="Edit what happened" className="cab-rise space-y-4 rounded-[22px] bg-surface p-5 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
      <label className="block">
        <span className="text-[13px] font-medium text-ink-soft">Name</span>
        <input
          value={form.title}
          maxLength={120}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="mt-1 w-full rounded-2xl bg-paper px-4 py-2.5 text-[15px] text-ink outline-none focus:ring-2 focus:ring-ink/10"
        />
      </label>
      <label className="block">
        <span className="text-[13px] font-medium text-ink-soft">What happened</span>
        <textarea
          value={form.description}
          maxLength={1000}
          rows={3}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="mt-1 w-full resize-none rounded-2xl bg-paper px-4 py-2.5 text-[15px] leading-relaxed text-ink outline-none focus:ring-2 focus:ring-ink/10"
        />
      </label>
      <div>
        <span className="text-[13px] font-medium text-ink-soft">When</span>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <input
            type="date"
            aria-label="Date it happened"
            value={form.date}
            max={today}
            disabled={form.unknownDate}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="rounded-full bg-paper px-4 py-2 text-[15px] text-ink outline-none disabled:opacity-40"
          />
          <label className="inline-flex items-center gap-2 text-[14px] text-ink-soft">
            <input type="checkbox" checked={form.unknownDate} onChange={(e) => setForm({ ...form, unknownDate: e.target.checked })} className="h-4 w-4 accent-[var(--ink)]" />
            Not sure
          </label>
        </div>
      </div>
      <div>
        <span className="text-[13px] font-medium text-ink-soft">Where</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {WHERE.map((w) => (
            <button key={w.value} type="button" aria-pressed={form.where === w.value} onClick={() => setForm({ ...form, where: w.value })} className={chip(form.where === w.value)}>
              {w.label}
            </button>
          ))}
        </div>
      </div>
      {theft && form.where && (
        <div>
          <span className="text-[13px] font-medium text-ink-soft">{indoors ? "Signs of a break-in?" : "Was it left unattended?"}</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {(indoors ? (["yes", "no", "unsure"] as const) : (["yes", "no"] as const)).map((v) => {
              const key = indoors ? "forced_entry" : "unattended";
              const on = form[key] === v;
              return (
                <button key={v} type="button" aria-pressed={on} onClick={() => setForm({ ...form, [key]: v })} className={chip(on)}>
                  {v === "yes" ? "Yes" : v === "no" ? "No" : "Not sure"}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={save} disabled={busy || form.description.trim().length < 3 || !form.title.trim()} className="cab-press rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm font-medium text-ink-soft hover:text-ink">
          Cancel
        </button>
      </div>
    </section>
  );
}

/** After details change, the guidance may be out of date: one tap checks the policy again. */
export function RecheckCover({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-brass-soft/60 px-4 py-3 text-[14px]">
      <span className="text-ink">You changed what happened.</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await send(`/api/claims/${claimId}/recheck`, "POST");
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="font-semibold text-ink underline underline-offset-4 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Check cover again"}
      </button>
      {error && <span className="w-full text-danger">{error}</span>}
    </div>
  );
}
