// Adding a file to a claim file from the browser: reserve a private path, upload it straight to
// private storage (the user's own folder only), then let the server check and keep it.
import { createClient } from "@/lib/supabase/client";
import { EVIDENCE_BUCKET, evidenceType, MAX_EVIDENCE_BYTES } from "@/lib/claims/evidence-kinds";
import type { ChecklistItem } from "@/lib/claims/types";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

export async function uploadEvidence(claimId: string, file: File, checklistItemId?: string): Promise<{ checklist: ChecklistItem[] | null }> {
  const type = evidenceType(file.name, file.type);
  if (!type) throw new Error("Add a PDF or a photo (JPEG, PNG, WebP or HEIC).");
  if (file.size > MAX_EVIDENCE_BYTES) throw new Error("Files must be 15 MB or smaller.");
  const init = await post(`/api/claims/${claimId}/evidence`, { fileName: file.name, sizeBytes: file.size, contentType: type, checklistItemId: checklistItemId ?? null });
  const { error } = await createClient().storage.from(EVIDENCE_BUCKET).upload(init.storagePath, file, { contentType: type, upsert: false });
  if (error) {
    // Let the server tidy up the reserved entry; then report the failure.
    await post(`/api/claims/${claimId}/evidence/${init.evidenceId}`, {}).catch(() => {});
    throw new Error("The file couldn't be uploaded. Please try again.");
  }
  return post(`/api/claims/${claimId}/evidence/${init.evidenceId}`, {});
}

/** Checklist items that are things you'd keep a copy of (receipts, reports, photos…). */
export const ATTACHABLE = /receipt|proof|photo|police|crime|report|quote|letter|email|medical|booking|confirmation|invoice|bill|evidence|document/i;
