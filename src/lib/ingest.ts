import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_UPLOAD_BYTES, STORAGE_BUCKET } from "@/lib/env";
import { RunLogger } from "@/lib/runs/logger";
import { LIMITS, withinLimit } from "@/lib/runs/rate-limit";
import { parsePdf, PdfError, type ParsedPdf } from "@/lib/pdf/parse";
import { chunkPages } from "@/lib/pdf/chunk";
import { ServiceError } from "@/lib/extraction/service";
import { retireSuppliedMissingNote } from "@/lib/audit/service";

/**
 * Step 1 of upload: validate metadata, create the document row and execution run, and return the
 * private storage path. The browser then uploads the file directly to Supabase Storage (avoids
 * serverless request-size limits); storage RLS restricts the path to the user's own folder, and the
 * bucket enforces PDF type and 15 MB size.
 */
export async function registerUpload(
  supabase: SupabaseClient,
  userId: string,
  input: { fileName: string; sizeBytes: number; contentType?: string },
  { enforceLimit = true }: { enforceLimit?: boolean } = {},
) {
  const { fileName, sizeBytes, contentType } = input;
  if (!fileName.toLowerCase().endsWith(".pdf") || (contentType && contentType !== "application/pdf")) {
    throw new ServiceError("not_pdf", "Only PDF files can be uploaded.", 415);
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new ServiceError("too_large", `PDFs must be ${MAX_UPLOAD_BYTES / 1024 / 1024} MB or smaller.`, 413);
  }
  if (enforceLimit && !(await withinLimit(supabase, "ingest", LIMITS.ingest.windowSeconds, LIMITS.ingest.max))) {
    throw new ServiceError("rate_limited", "You've uploaded a lot of documents recently. Please try again later.", 429);
  }

  const run = await RunLogger.start(supabase, userId, "ingest");
  const documentId = crypto.randomUUID();
  const storagePath = `${userId}/${documentId}.pdf`;

  const created = await run
    .step(
      "register_upload",
      async () => {
        const { error } = await supabase.from("documents").insert({
          id: documentId,
          user_id: userId, // from the verified session, never from the request body
          file_name: fileName,
          storage_path: storagePath,
          size_bytes: sizeBytes,
          processing_status: "awaiting_upload",
        });
        if (error) throw Object.assign(new Error("insert failed"), { code: "db_insert_failed" });
        return true;
      },
      { document_id: documentId, size_bytes: sizeBytes },
    )
    .catch(() => false);

  if (!created) {
    await run.finish("failed");
    throw new ServiceError("db_insert_failed", "Could not start the upload. Please try again.", 500);
  }
  return { documentId, storagePath, runId: run.runId };
}

/**
 * Step 2 of upload: fetch the privately stored PDF, verify it, extract page-numbered text, and store
 * searchable chunks. Every step is logged with redacted metadata.
 */
export async function processStoredDocument(supabase: SupabaseClient, userId: string, documentId: string, runId?: string) {
  // RLS guarantees this only returns the caller's own document.
  const { data: doc } = await supabase.from("documents").select("id, storage_path, processing_status").eq("id", documentId).maybeSingle();
  if (!doc) throw new ServiceError("not_found", "Not found.", 404);
  if (doc.processing_status !== "awaiting_upload" && doc.processing_status !== "failed") {
    throw new ServiceError("already_processed", "This document has already been processed.", 409);
  }

  const run = (runId && (await RunLogger.resume(supabase, userId, runId))) || (await RunLogger.start(supabase, userId, "ingest"));

  const fail = async (code: string, message: string, status = 422): Promise<never> => {
    await supabase.from("documents").update({ processing_status: "failed", error_code: code, error_message: message }).eq("id", documentId);
    // Don't keep files we can't use.
    await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]);
    await run.finish("failed");
    throw Object.assign(new ServiceError(code, message, status), { runId: run.runId });
  };

  await supabase.from("documents").update({ processing_status: "processing", error_code: null, error_message: null }).eq("id", documentId);

  // 1. Download from private storage
  let bytes: Uint8Array;
  try {
    bytes = await run.step(
      "download_private_file",
      async () => {
        const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(doc.storage_path);
        if (error || !data) throw Object.assign(new Error("download failed"), { code: "storage_missing" });
        return new Uint8Array(await data.arrayBuffer());
      },
      (b) => ({ document_id: documentId, size_bytes: b.byteLength }),
    );
  } catch {
    return fail("storage_missing", "We couldn't find the uploaded file. Please upload it again.");
  }

  // 2. Hash (integrity + duplicate detection; the hash is safe to log)
  const sha256 = await run.step(
    "hash_file",
    async () => createHash("sha256").update(bytes).digest("hex"),
    (h) => ({ document_id: documentId, file_sha256: h }),
  );

  // 3. Parse with exact 1-indexed page numbers
  let parsed: ParsedPdf;
  try {
    parsed = await run.step("parse_pdf_pages", () => parsePdf(bytes), (p) => ({
      document_id: documentId,
      page_count: p.pageCount,
      instructions_removed: p.instructionsRemoved ?? 0,
    }));
  } catch (err) {
    if (err instanceof PdfError) return fail(err.code, err.message);
    return fail("unreadable", "We couldn't read this PDF.");
  }

  // 4. Chunk + store (chunks never cross pages, so each keeps an exact page citation)
  const chunks = chunkPages(parsed.pages);
  try {
    await run.step(
      "store_chunks",
      async () => {
        await supabase.from("document_chunks").delete().eq("document_id", documentId); // idempotent retry
        const { error } = await supabase.from("document_chunks").insert(
          chunks.map((c) => ({
            user_id: userId,
            document_id: documentId,
            page_number: c.pageNumber,
            chunk_index: c.chunkIndex,
            text: c.text,
          })),
        );
        if (error) throw Object.assign(new Error("chunk insert failed"), { code: "db_insert_failed" });
      },
      { document_id: documentId, chunk_count: chunks.length },
    );
  } catch {
    return fail("db_insert_failed", "We couldn't save the document text. Please try again.", 500);
  }

  await supabase
    .from("documents")
    .update({ processing_status: "parsed", sha256, page_count: parsed.pageCount, size_bytes: bytes.byteLength })
    .eq("id", documentId);
  await run.finish("succeeded");
  return { documentId, runId: run.runId, pageCount: parsed.pageCount, chunkCount: chunks.length };
}

/**
 * Adds an already-read document (e.g. a schedule the policy refers to) to one of the user's policies,
 * so its text is searched when answering questions about that policy. Both rows must belong to the
 * caller (RLS); the document must be read and not yet part of another policy.
 */
export async function attachDocumentToPolicy(supabase: SupabaseClient, userId: string, policyId: string, documentId: string) {
  const [{ data: policy }, { data: doc }] = await Promise.all([
    supabase.from("policies").select("id").eq("id", policyId).maybeSingle(),
    supabase.from("documents").select("id, policy_id, processing_status").eq("id", documentId).maybeSingle(),
  ]);
  if (!policy || !doc) throw new ServiceError("not_found", "Not found.", 404);
  if (doc.policy_id) throw new ServiceError("already_attached", "This document is already part of a policy.", 409);
  if (doc.processing_status !== "parsed") throw new ServiceError("not_ready", "This document hasn't been read yet.", 409);

  const run = await RunLogger.start(supabase, userId, "action");
  try {
    await run.step(
      "user_attached_document",
      async () => {
        const fail = () => Object.assign(new Error("update failed"), { code: "db_update_failed" });
        if ((await supabase.from("documents").update({ policy_id: policyId }).eq("id", documentId)).error) throw fail();
        if ((await supabase.from("document_chunks").update({ policy_id: policyId }).eq("document_id", documentId)).error) throw fail();
      },
      { document_id: documentId, policy_id: policyId },
    );
    // If this is the document a "A document is missing" note was waiting for, that note goes now.
    await run
      .step("check_missing_document_note", () => retireSuppliedMissingNote(supabase, policyId), (id) => ({
        policy_id: policyId,
        insight_id: id ?? undefined,
        completed: Boolean(id),
      }))
      .catch(() => null);
    await run.finish("succeeded");
  } catch {
    await run.finish("failed");
    throw new ServiceError("attach_failed", "We couldn't add this document. Please try again.", 500);
  }
}
