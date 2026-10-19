"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { HedgehogReading, PenguinWithPolicy } from "@/components/cabinet/animals";
import { PolicyScene } from "@/components/cabinet/policy-scenes";
import { Icon } from "@/components/cabinet/illustrations";
import { folderTones } from "@/components/cabinet/theme";

const MAX_BYTES = 15 * 1024 * 1024;
const BUCKET = "policy-pdfs";

const SAMPLES = [
  { file: "travel.pdf", type: "travel", label: "Travel", name: "Sample travel policy" },
  { file: "contents.pdf", type: "contents", label: "Home", name: "Sample contents policy" },
  { file: "gadget.pdf", type: "gadget", label: "Gadget", name: "Sample gadget cover" },
];

type Stage = "idle" | "registering" | "uploading" | "processing" | "extracting" | "done" | "error";
type Working = Exclude<Stage, "idle" | "error">;

// What we say at each step, and how far along the bar is.
const STEPS: Record<Working, { text: string; progress: number }> = {
  registering: { text: "Uploading securely", progress: 0.12 },
  uploading: { text: "Uploading securely", progress: 0.3 },
  processing: { text: "Reading every page", progress: 0.55 },
  extracting: { text: "Finding the key details", progress: 0.82 },
  done: { text: "All read", progress: 1 },
};

/** Add a policy: one button (or drop a PDF anywhere here); Cabinet reads it and puts it in the wallet. */
export function UploadForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readButStuck, setReadButStuck] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function pick(f: File | null | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf") || (f.type && f.type !== "application/pdf")) {
      return setError("Only PDF files can be added.");
    }
    if (f.size > MAX_BYTES) return setError("This PDF is larger than 15 MB.");
    void upload(f);
  }

  // Loads a FICTIONAL sample PDF and sends it through the exact same upload pipeline.
  async function uploadSample(name: string) {
    setError(null);
    try {
      const res = await fetch(`/samples/${name}`);
      if (!res.ok) throw new Error("Sample not available.");
      await upload(new File([await res.blob()], `FICTIONAL-SAMPLE-${name}`, { type: "application/pdf" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the sample.");
    }
  }

  async function upload(file: File) {
    setError(null);
    setReadButStuck(null);
    setPages(null);
    setFileName(file.name);
    try {
      setStage("registering");
      const initRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, sizeBytes: file.size, contentType: file.type || "application/pdf" }),
      });
      const init = await initRes.json();
      if (!initRes.ok) throw new Error(init.error ?? "Upload could not start.");

      setStage("uploading");
      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(init.storagePath, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error("The file could not be uploaded. Please check it is a PDF under 15 MB.");

      setStage("processing");
      const procRes = await fetch(`/api/documents/${init.documentId}/process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: init.runId }),
      });
      const proc = await procRes.json();
      if (!procRes.ok) throw new Error(proc.error ?? "We couldn't read this PDF.");
      setPages(proc.pageCount);

      setStage("extracting");
      const exRes = await fetch(`/api/documents/${init.documentId}/extract`, { method: "POST" });
      const ex = await exRes.json().catch(() => ({}));
      if (!exRes.ok) {
        setReadButStuck(init.documentId);
        setError(`We read your document but couldn't pick out its details: ${ex.error ?? "please try again."}`);
        setStage("error");
        return;
      }
      setStage("done");
      // Straight into the wallet; if it couldn't be added automatically, open its edit page instead.
      router.push(ex.policyId ? `/app?added=${ex.policyId}` : `/app/documents/${init.documentId}/review`);
      router.refresh(); // a first policy brings back the full top bar
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStage("error");
    }
  }

  if (stage !== "idle" && stage !== "error") {
    const step = STEPS[stage];
    return (
      <div className="cab-rise flex flex-col items-center text-center">
        <HedgehogReading className="h-36 w-auto" />
        <h1 className="font-display mt-8 text-[30px] font-normal tracking-tight text-ink">Reading your policy</h1>
        <p className="mt-2 text-[15px] text-ink-soft" aria-live="polite">
          {step.text}
          {stage === "extracting" && pages ? ` from ${pages} pages` : ""}
          {stage === "done" ? "" : "…"}
        </p>
        <div className="mt-7 h-1 w-52 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(step.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Progress">
          <div className="h-full rounded-full bg-ink transition-[width] duration-700 ease-out" style={{ width: `${step.progress * 100}%` }} />
        </div>
        <p className="mt-4 text-xs text-ink-faint">
          {stage === "extracting" && !demo ? "About a minute." : " "}
        </p>
        <p className="mt-10 max-w-[16rem] truncate text-xs text-ink-faint">{fileName}</p>
      </div>
    );
  }

  return (
    <div
      className="cab-rise flex flex-col items-center text-center"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="relative grid h-56 w-56 place-items-center">
        <span
          aria-hidden="true"
          className={`absolute inset-5 rounded-[46%_54%_42%_58%/55%_45%_55%_45%] bg-paper-deep transition-transform duration-500 ease-out ${dragging ? "rotate-6 scale-110" : ""}`}
        />
        <PenguinWithPolicy className="cab-float relative h-44 w-auto" />
      </div>
      <h1 className="font-display mt-4 text-[30px] font-normal tracking-tight text-ink">Add a policy</h1>
      <p className="mt-2 h-6 text-[15px] text-ink-soft">{dragging ? "Drop it here" : ""}</p>

      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Choose a policy PDF"
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className="cab-press mt-7 rounded-full bg-ink px-8 py-3.5 text-[15px] font-semibold text-paper">
        Choose a PDF
      </button>

      {error && (
        <div role="alert" className="mt-5 max-w-sm rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
          {readButStuck && (
            <Link href={`/app/documents/${readButStuck}/review`} className="mt-1 block font-semibold underline underline-offset-2">
              Open it and try again
            </Link>
          )}
        </div>
      )}

      <div id="samples" className="mt-14 scroll-mt-24">
        <p className="small-caps text-ink-faint">Or try a sample</p>
        <div className="mt-5 flex justify-center gap-4">
          {SAMPLES.map((s) => {
            const tone = folderTones(s.type);
            return (
              <button key={s.file} type="button" aria-label={s.name} onClick={() => uploadSample(s.file)} className="cab-press group flex flex-col items-start">
                <span className="transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-1">
                  <span className="block h-3 w-10 rounded-t-[8px]" style={{ background: tone.back }} />
                  <span className="grid h-[76px] w-[88px] place-items-center rounded-[14px] rounded-tl-none" style={{ background: tone.front, boxShadow: `inset 0 3px 0 ${tone.back}` }}>
                    <PolicyScene type={s.type} className="h-auto w-[76px]" />
                  </span>
                </span>
                <span className="mt-2 w-full text-center text-[13px] font-medium text-ink-soft group-hover:text-ink">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-12 flex items-center gap-1.5 text-xs text-ink-faint">
        <Icon.Lock className="h-3.5 w-3.5" /> Private to you · PDF up to 15 MB
      </p>
    </div>
  );
}
