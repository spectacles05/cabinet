import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceError } from "@/lib/extraction/service";
import { looksLikePdf } from "@/lib/pdf/parse";
import { RunLogger } from "@/lib/runs/logger";
import { getClaim } from "./service";
import { EVIDENCE_BUCKET, evidenceType, guessKind, MAX_EVIDENCE_BYTES, type EvidenceKind, type EvidenceType } from "./evidence-kinds";
import type { ChecklistItem } from "./types";

export { EVIDENCE_BUCKET };
const MAX_FILES_PER_CLAIM = 40;
const MAX_UPLOADS_PER_HOUR = 60;

export type EvidenceRow = {
  id: string;
  claim_id: string;
  file_name: string;
  content_type: EvidenceType;
  size_bytes: number;
  kind: EvidenceKind;
  checklist_item_id: string | null;
  created_at: string;
};

const COLUMNS = "id, claim_id, file_name, content_type, size_bytes, kind, checklist_item_id, created_at";
const EXT: Record<EvidenceType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Checks a file's first bytes match the type it claims to be (names and browser types can lie). */
export function bytesMatchType(bytes: Uint8Array, type: EvidenceType): boolean {
  const at = (i: number, ...b: number[]) => b.every((v, k) => bytes[i + k] === v);
  const ascii = (i: number, s: string) => at(i, ...[...s].map((c) => c.charCodeAt(0)));
  switch (type) {
    case "application/pdf":
      return looksLikePdf(bytes);
    case "image/jpeg":
      return at(0, 0xff, 0xd8, 0xff);
    case "image/png":
      return at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/heic":
    case "image/heif":
      return ascii(4, "ftyp") && ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"].some((brand) => ascii(8, brand));
  }
}

async function ownClaim(supabase: SupabaseClient, claimId: string) {
  const claim = await getClaim(supabase, claimId);
  if (!claim) throw new ServiceError("not_found", "That claim file wasn't found.", 404);
  return claim;
}

export async function listEvidence(supabase: SupabaseClient, claimId: string): Promise<EvidenceRow[]> {
  const { data, error } = await supabase.from("claim_evidence").select(COLUMNS).eq("claim_id", claimId).eq("status", "ready").order("created_at");
  if (error) throw new ServiceError("db_read_failed", "Your evidence didn't load. Please refresh.", 500);
  return (data ?? []) as EvidenceRow[];
}

/** Step 1 of adding evidence: check it's allowed, and reserve a private path in the user's own folder. */
export async function registerEvidence(
  supabase: SupabaseClient,
  userId: string,
  claimId: string,
  input: { fileName: string; sizeBytes: number; contentType: string; checklistItemId?: string | null },
) {
  const claim = await ownClaim(supabase, claimId);
  const type = evidenceType(input.fileName, input.contentType);
  if (!type) throw new ServiceError("unsupported_type", "Add a PDF or a photo (JPEG, PNG, WebP or HEIC).", 415);
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_EVIDENCE_BYTES) throw new ServiceError("too_large", "Files must be 15 MB or smaller.", 413);
  const item = input.checklistItemId ? claim.checklist_json.find((c) => c.id === input.checklistItemId) : undefined;
  if (input.checklistItemId && !item) throw new ServiceError("not_found", "That checklist item wasn't found.", 404);

  const [{ count: inClaim }, { count: lastHour }] = await Promise.all([
    supabase.from("claim_evidence").select("id", { count: "exact", head: true }).eq("claim_id", claimId),
    supabase.from("claim_evidence").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 3600_000).toISOString()),
  ]);
  if ((inClaim ?? 0) >= MAX_FILES_PER_CLAIM) throw new ServiceError("too_many_files", `A claim file can hold up to ${MAX_FILES_PER_CLAIM} files.`, 409);
  if ((lastHour ?? 0) >= MAX_UPLOADS_PER_HOUR) throw new ServiceError("rate_limited", "You've added a lot of files recently. Please try again later.", 429);

  const run = await RunLogger.start(supabase, userId, "action");
  try {
    const evidenceId = crypto.randomUUID();
    const storagePath = `${userId}/${claimId}/${evidenceId}.${EXT[type]}`;
    const fileName = input.fileName.replace(/[\\/\u0000-\u001f]/g, "").trim().slice(0, 200) || `evidence.${EXT[type]}`;
    await run.step(
      "register_evidence",
      async () => {
        const { error } = await supabase.from("claim_evidence").insert({
          id: evidenceId,
          user_id: userId,
          claim_id: claimId,
          file_name: fileName,
          content_type: type,
          size_bytes: input.sizeBytes,
          kind: guessKind(fileName, type, item?.label),
          checklist_item_id: item?.id ?? null,
          storage_path: storagePath,
          status: "uploading",
        });
        if (error) throw Object.assign(new Error("insert"), { code: "db_insert_failed" });
      },
      { claim_id: claimId, size_bytes: input.sizeBytes },
    );
    await run.finish("succeeded");
    return { evidenceId, storagePath, bucket: EVIDENCE_BUCKET, runId: run.runId };
  } catch (err) {
    await run.finish("failed");
    if (err instanceof ServiceError) throw err;
    throw new ServiceError("save_failed", "We couldn't add that file. Please try again.", 500);
  }
}

/**
 * Step 2, after the browser has uploaded the file to private storage: check the stored bytes are
 * really that kind of file, then keep it. If it was added for a checklist item, that item is ticked.
 */
export async function confirmEvidence(
  supabase: SupabaseClient,
  userId: string,
  claimId: string,
  evidenceId: string,
): Promise<{ evidence: EvidenceRow; checklist: ChecklistItem[] | null }> {
  const claim = await ownClaim(supabase, claimId);
  const { data: row } = await supabase
    .from("claim_evidence")
    .select(`${COLUMNS}, storage_path, status`)
    .eq("id", evidenceId)
    .eq("claim_id", claimId)
    .maybeSingle();
  if (!row) throw new ServiceError("not_found", "That file wasn't found.", 404);
  if (row.status === "ready") return { evidence: row as EvidenceRow, checklist: null };

  const run = await RunLogger.start(supabase, userId, "action");
  const discard = async (code: string, message: string, status: number): Promise<never> => {
    await supabase.storage.from(EVIDENCE_BUCKET).remove([row.storage_path as string]);
    await supabase.from("claim_evidence").delete().eq("id", evidenceId);
    await run.finish("failed");
    throw new ServiceError(code, message, status);
  };
  try {
    const bytes = await run.step(
      "check_evidence_file",
      async () => {
        const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(row.storage_path as string);
        if (error || !data) throw Object.assign(new Error("download"), { code: "storage_missing" });
        return new Uint8Array(await data.arrayBuffer());
      },
      (b) => ({ claim_id: claimId, size_bytes: b.byteLength }),
    ).catch(() => null);
    if (!bytes) return discard("storage_missing", "The file didn't upload. Please try again.", 422);
    if (bytes.byteLength > MAX_EVIDENCE_BYTES) return discard("too_large", "Files must be 15 MB or smaller.", 413);
    if (!bytesMatchType(bytes, row.content_type as EvidenceType)) return discard("unsupported_type", "That file isn't a PDF or photo we can keep.", 415);

    let checklist: ChecklistItem[] | null = null;
    await run.step(
      "store_evidence",
      async () => {
        const { error } = await supabase.from("claim_evidence").update({ status: "ready", size_bytes: bytes.byteLength }).eq("id", evidenceId);
        if (error) throw Object.assign(new Error("update"), { code: "db_update_failed" });
        const itemId = row.checklist_item_id as string | null;
        if (itemId && claim.checklist_json.some((c) => c.id === itemId && !c.done)) {
          checklist = claim.checklist_json.map((c) => (c.id === itemId ? { ...c, done: true, done_at: new Date().toISOString() } : c));
          await supabase.from("claims").update({ checklist_json: checklist }).eq("id", claimId);
        }
      },
      { claim_id: claimId, completed: true },
    );
    await run.finish("succeeded");
    return { evidence: { ...(row as EvidenceRow), size_bytes: bytes.byteLength }, checklist };
  } catch (err) {
    await run.finish("failed");
    if (err instanceof ServiceError) throw err;
    throw new ServiceError("save_failed", "We couldn't keep that file. Please try again.", 500);
  }
}

export async function deleteEvidence(supabase: SupabaseClient, userId: string, claimId: string, evidenceId: string) {
  const { data: row } = await supabase.from("claim_evidence").select("id, storage_path").eq("id", evidenceId).eq("claim_id", claimId).maybeSingle();
  if (!row) throw new ServiceError("not_found", "That file wasn't found.", 404);
  const run = await RunLogger.start(supabase, userId, "action");
  try {
    await run.step(
      "user_removed_evidence",
      async () => {
        await supabase.storage.from(EVIDENCE_BUCKET).remove([row.storage_path as string]);
        const { data, error } = await supabase.from("claim_evidence").delete().eq("id", evidenceId).select("id");
        if (error || !data?.length) throw Object.assign(new Error("delete"), { code: "db_delete_failed" });
      },
      { claim_id: claimId },
    );
    await run.finish("succeeded");
  } catch (err) {
    await run.finish("failed");
    if (err instanceof ServiceError) throw err;
    throw new ServiceError("delete_failed", "We couldn't remove that file. Please try again.", 500);
  }
}

/** A 60-second private link to one evidence file (RLS and storage policy: owner only). */
export async function evidenceUrl(supabase: SupabaseClient, claimId: string, evidenceId: string): Promise<string | null> {
  const { data: row } = await supabase.from("claim_evidence").select("storage_path").eq("id", evidenceId).eq("claim_id", claimId).eq("status", "ready").maybeSingle();
  if (!row) return null;
  const { data } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(row.storage_path as string, 60);
  return data?.signedUrl ?? null;
}

/** Storage paths of every evidence file under these claims (for deleting a claim or policy). */
export async function evidencePaths(supabase: SupabaseClient, claimIds: string[]): Promise<string[]> {
  if (!claimIds.length) return [];
  const { data } = await supabase.from("claim_evidence").select("storage_path").in("claim_id", claimIds);
  return (data ?? []).map((r) => r.storage_path as string);
}
