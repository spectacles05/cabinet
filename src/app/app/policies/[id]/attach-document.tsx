"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Icon } from "@/components/cabinet/illustrations";

const MAX_BYTES = 15 * 1024 * 1024;

/** Adds another document (e.g. a schedule the policy refers to) to this policy: upload, read, attach. */
export function AttachDocument({ policyId }: { policyId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) return setError("Only PDF files can be added.");
    if (file.size > MAX_BYTES) return setError("This PDF is larger than 15 MB.");
    setBusy(true);
    setError(null);
    try {
      const post = async (url: string, body: unknown) => {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
        return json;
      };
      const init = await post("/api/documents", { fileName: file.name, sizeBytes: file.size, contentType: file.type || "application/pdf" });
      const { error: upErr } = await createClient()
        .storage.from("policy-pdfs")
        .upload(init.storagePath, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error("The file could not be uploaded.");
      await post(`/api/documents/${init.documentId}/process`, { runId: init.runId });
      await post(`/api/policies/${policyId}/documents`, { documentId: init.documentId });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Choose a PDF to add to this policy"
        className="sr-only"
        onChange={(e) => {
          add(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="cab-press inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-medium text-ink shadow-sm hover:shadow disabled:opacity-60"
      >
        <Icon.Plus className="h-4 w-4" />
        {busy ? "Adding…" : "Add a document"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
