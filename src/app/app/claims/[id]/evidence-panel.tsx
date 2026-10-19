"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PenguinWithPolicy } from "@/components/cabinet/animals";
import { Icon } from "@/components/cabinet/illustrations";
import { Boop } from "@/components/cabinet/peeker";
import { EVIDENCE_ACCEPT, KIND_LABEL, type EvidenceKind, type EvidenceType } from "@/lib/claims/evidence-kinds";
import { uploadEvidence } from "./upload";

export type EvidenceItem = { id: string; file_name: string; content_type: EvidenceType; kind: EvidenceKind; size_bytes: number; created_at: string };

const fileUrl = (claimId: string, id: string) => `/api/claims/${claimId}/evidence/${id}/file`;
// Browsers can show these as thumbnails; HEIC and PDFs get a document tile instead.
const PREVIEWABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The claim file's evidence: receipts, photos, reports and letters, kept privately in one place. */
export function EvidencePanel({ claimId, items }: { claimId: string; items: EvidenceItem[] }) {
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [filed, setFiled] = useState(0);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, 10);
    setAdding(list.length);
    for (const file of list) {
      try {
        await uploadEvidence(claimId, file);
        setFiled((n) => n + 1);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      }
      setAdding((n) => n - 1);
    }
    router.refresh();
  }

  async function remove(id: string) {
    setRemoving(id);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/evidence/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    setRemoving(null);
    setConfirming(null);
    if (!res.ok) return setError(json.error ?? "We couldn't remove that file.");
    router.refresh();
  }

  const addButton = (
    <button
      type="button"
      onClick={() => picker.current?.click()}
      disabled={adding > 0}
      className="cab-press inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-[15px] font-semibold text-paper disabled:opacity-60"
    >
      <Icon.Plus className="h-4 w-4" /> {adding > 0 ? `Adding ${adding}…` : "Add files"}
    </button>
  );

  return (
    <div className="space-y-4">
      <input
        ref={picker}
        type="file"
        multiple
        accept={EVIDENCE_ACCEPT}
        className="sr-only"
        aria-label="Choose files to add to this claim file"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {items.length === 0 ? (
        <div className="cab-rise flex flex-col items-center pt-4 text-center">
          <PenguinWithPolicy className="h-24 w-auto" />
          <p className="mt-4 text-[15px] text-ink-soft">Keep receipts, photos, police reports and letters here.</p>
          <div className="mt-5">{addButton}</div>
        </div>
      ) : (
        <>
<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Evidence files">
            {items.map((e) => (
              <li key={e.id} className="group relative">
                <a
                  href={fileUrl(claimId, e.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-[18px] bg-surface shadow-[0_1px_2px_rgba(21,23,28,0.06)] transition-shadow hover:shadow-md"
                >
                  <span className="grid aspect-[4/3] place-items-center bg-paper-deep/50">
                    {PREVIEWABLE.has(e.content_type) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived signed link
                      <img src={fileUrl(claimId, e.id)} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <Icon.Doc className="h-9 w-9 text-ink-faint" />
                    )}
                  </span>
                  <span className="block px-3 py-2.5">
                    <span className="block truncate text-[13px] font-medium text-ink">{e.file_name}</span>
                    <span className="block text-[12px] text-ink-faint">{KIND_LABEL[e.kind]}</span>
                  </span>
                </a>
                {confirming === e.id ? (
                  <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2 rounded-full bg-surface/95 py-1 pl-3 pr-1 text-[12px] shadow">
                    <span className="text-ink">Remove?</span>
                    <span className="flex gap-1">
                      <button type="button" disabled={removing === e.id} onClick={() => remove(e.id)} className="rounded-full bg-danger px-2.5 py-1 font-semibold text-white disabled:opacity-50">
                        {removing === e.id ? "…" : "Remove"}
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="rounded-full px-2 py-1 text-ink-soft">
                        Keep
                      </button>
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(e.id)}
                    aria-label={`Remove ${e.file_name}`}
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-surface/90 text-[16px] leading-none text-ink-soft opacity-100 shadow-sm transition-opacity hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          {/* The penguin hands over each new file: "Filed!" */}
          <div className="flex items-end justify-center gap-2 pt-4">
            {addButton}
            <Boop
              label="Say hello to the penguin"
              bubbleSide="top"
              say={filed ? "Filed!" : null}
              sayKey={filed}
              phrases={["I'll keep these safe.", "Only you can see these.", "Add as many as you need."]}
            >
              <PenguinWithPolicy className="h-16 w-auto" />
            </Boop>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
