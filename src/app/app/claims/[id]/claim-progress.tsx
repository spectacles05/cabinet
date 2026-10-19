"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Checklist } from "@/components/claim-checklist";
import { Boop } from "@/components/cabinet/peeker";
import { HedgehogReading } from "@/components/cabinet/animals";
import { EVIDENCE_ACCEPT } from "@/lib/claims/evidence-kinds";
import type { ChecklistItem, ClaimStatus } from "@/lib/claims/types";
import { ATTACHABLE, uploadEvidence } from "./upload";

async function patch(url: string, body: unknown) {
  const res = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

/** Next steps on a claim file: tick things off, file a document straight from its step, record where it's at. */
export function ClaimProgress({ claimId, status, checklist, insurer }: { claimId: string; status: ClaimStatus; checklist: ChecklistItem[]; insurer: string }) {
  const router = useRouter();
  const [items, setItems] = useState(checklist);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyStatus, setBusyStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const attachFor = useRef<ChecklistItem | null>(null);
  const done = items.filter((c) => c.done).length;
  const allDone = items.length > 0 && done === items.length;

  async function toggle(id: string) {
    const item = items.find((c) => c.id === id);
    if (!item) return;
    setBusyId(id);
    setError(null);
    try {
      const r = await patch(`/api/claims/${claimId}`, { itemId: id, done: !item.done });
      setItems(r.checklist);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function attach(file: File | undefined) {
    const item = attachFor.current;
    if (!file || !item) return;
    setBusyId(item.id);
    setError(null);
    try {
      const r = await uploadEvidence(claimId, file, item.id);
      if (r.checklist) setItems(r.checklist);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(next: ClaimStatus) {
    setBusyStatus(true);
    setError(null);
    try {
      await patch(`/api/claims/${claimId}`, { status: next, confirmed: true });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyStatus(false);
    }
  }

  return (
    <div className="relative mt-14">
      {/* The hedgehog stands on the card, reading through the paperwork. */}
      <Boop
        label="Say hello to the hedgehog"
        className="absolute bottom-[calc(100%-6px)] right-6 z-0"
        bubbleSide="left"
        say={allDone ? "All done!" : null}
        phrases={allDone ? ["All done!", "Nicely organised."] : ["One step at a time.", "Tap Add to file a document.", "I'm reading the small print."]}
      >
        <HedgehogReading className="h-[60px] w-auto" />
      </Boop>
    <section aria-label="Next steps" className="relative z-10 rounded-[22px] bg-surface p-5 shadow-[0_1px_2px_rgba(21,23,28,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold text-ink">Next steps</p>
        <span className="text-[13px] text-ink-soft">
          {done} of {items.length} done
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
        <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      <input
        ref={picker}
        type="file"
        accept={EVIDENCE_ACCEPT}
        className="sr-only"
        aria-label="Choose a file to add"
        onChange={(e) => {
          attach(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="mt-2">
        <Checklist
          items={items}
          onToggle={toggle}
          busyId={busyId}
          canAttach={(c) => ATTACHABLE.test(c.label)}
          onAttach={(c) => {
            attachFor.current = c;
            picker.current?.click();
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {/* Ordinary, reversible changes: the tap is the user's say-so (nothing is sent anywhere). */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px]">
        {status === "preparing" && (
          <button type="button" disabled={busyStatus} onClick={() => changeStatus("submitted")} className="cab-press rounded-full bg-ink px-4 py-2 font-semibold text-paper disabled:opacity-50">
            I&apos;ve sent it to {insurer}
          </button>
        )}
        {status !== "closed" && (
          <button type="button" disabled={busyStatus} onClick={() => changeStatus("closed")} className="font-medium text-ink-soft hover:text-ink disabled:opacity-50">
            Close claim
          </button>
        )}
        {status !== "preparing" && (
          <button type="button" disabled={busyStatus} onClick={() => changeStatus("preparing")} className="font-medium text-ink-soft hover:text-ink disabled:opacity-50">
            Back to preparing
          </button>
        )}
      </div>
    </section>
    </div>
  );
}
