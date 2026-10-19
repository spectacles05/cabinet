import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppMode } from "@/lib/ai/mode";
import { STORAGE_BUCKET } from "@/lib/env";
import { RunLogger } from "@/lib/runs/logger";
import { registerUpload, processStoredDocument } from "@/lib/ingest";
import { runExtraction, ServiceError } from "@/lib/extraction/service";
import { autoAddToWallet } from "@/lib/extraction/confirm";
import { DEMO_SAMPLES } from "./samples";

// Bundled with the reset route on Vercel via outputFileTracingIncludes in next.config.ts.
const SAMPLES_DIR = path.join(process.cwd(), "samples");

/**
 * Demo Mode only: removes all of the signed-in user's Cabinet data (policies, documents, text,
 * chats, findings, tasks) and adds the three fictional sample policies back through the normal
 * pipeline (upload, read, verify, add to wallet). Uses the user's own RLS-scoped client throughout,
 * so it can only ever touch that user's data. The activity log is kept.
 */
export async function resetDemoWallet(supabase: SupabaseClient, userId: string) {
  if ((await getAppMode()) !== "demo") throw new ServiceError("not_demo", "Reset is only available in Demo Mode.", 403);

  const run = await RunLogger.start(supabase, userId, "action");
  try {
    await run.step(
      "demo_reset_clear_data",
      async () => {
        const fail = () => Object.assign(new Error("delete failed"), { code: "db_delete_failed" });
        const { data: docs } = await supabase.from("documents").select("storage_path");
        const paths = (docs ?? []).map((d) => d.storage_path as string);
        if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);
        // Claim files cascade from policies; their evidence files are removed here.
        const { data: evidence } = await supabase.from("claim_evidence").select("storage_path");
        const evidencePaths = (evidence ?? []).map((e) => e.storage_path as string);
        if (evidencePaths.length) await supabase.storage.from("claim-evidence").remove(evidencePaths);
        // Children first; chunks and extractions cascade from documents, messages from threads, claims from policies.
        for (const table of ["action_items", "insights", "qa_threads", "documents", "policies"]) {
          if ((await supabase.from(table).delete().eq("user_id", userId)).error) throw fail();
        }
        return paths.length;
      },
      (n) => ({ document_count: n, app_mode: "demo" }),
    );
    await run.finish("succeeded");
  } catch {
    await run.finish("failed");
    throw new ServiceError("reset_failed", "We couldn't clear your demo data. Please try again.", 500);
  }

  // Each sample goes through exactly what an upload does, so the activity log shows the real pipeline.
  const policyIds: string[] = [];
  for (const sample of DEMO_SAMPLES) {
    const bytes = await readFile(path.join(SAMPLES_DIR, sample.file));
    const reg = await registerUpload(
      supabase,
      userId,
      { fileName: `FICTIONAL-SAMPLE-${sample.file}`, sizeBytes: bytes.byteLength, contentType: "application/pdf" },
      { enforceLimit: false },
    );
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(reg.storagePath, new Blob([bytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: false });
    if (error) throw new ServiceError("storage_failed", "We couldn't restore the sample files. Please try again.", 500);
    await processStoredDocument(supabase, userId, reg.documentId, reg.runId);
    await runExtraction(supabase, userId, reg.documentId);
    policyIds.push(await autoAddToWallet(supabase, userId, reg.documentId));
  }
  return { policyIds };
}
