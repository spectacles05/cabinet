import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/env";
import { RunLogger } from "@/lib/runs/logger";
import { ServiceError } from "@/lib/extraction/service";
import { EVIDENCE_BUCKET, evidencePaths } from "@/lib/claims/evidence";

/**
 * Permanently deletes one of the signed-in user's policies and everything derived from it:
 * the stored PDFs, extracted text (chunks), machine/user extractions, policy-scoped chats, any
 * all-policies chat that quoted it, and findings/tasks based on it. All through the user's own
 * RLS-scoped client. The execution log keeps only ids and counts (no content), as an audit trail.
 */
export async function deletePolicy(supabase: SupabaseClient, userId: string, policyId: string) {
  const { data: policy } = await supabase.from("policies").select("id").eq("id", policyId).maybeSingle();
  if (!policy) throw new ServiceError("not_found", "Policy not found.", 404);

  const run = await RunLogger.start(supabase, userId, "action");
  try {
    const counts = await run.step(
      "user_deleted_policy",
      async () => {
        const fail = () => Object.assign(new Error("delete failed"), { code: "db_delete_failed" });

        const { data: docs } = await supabase.from("documents").select("id, storage_path").eq("policy_id", policyId);
        // All-policies chats whose answers quoted this policy.
        // jsonb containment needs a JSON string: supabase-js would send a JS array as a Postgres array literal.
        const { data: citing, error: citingErr } = await supabase
          .from("qa_messages")
          .select("thread_id")
          .filter("citations_json", "cs", JSON.stringify([{ policy_id: policyId }]));
        if (citingErr) throw fail();
        const threadIds = [...new Set((citing ?? []).map((m) => m.thread_id as string))];
        // Findings (and tasks made from them) that are based on this policy.
        const { data: insights, error: insightsErr } = await supabase
          .from("insights")
          .select("id")
          .filter("evidence_json", "cs", JSON.stringify({ policy_ids: [policyId] }));
        if (insightsErr) throw fail();
        const insightIds = (insights ?? []).map((i) => i.id as string);

        if (insightIds.length) {
          if ((await supabase.from("action_items").delete().in("insight_id", insightIds)).error) throw fail();
          if ((await supabase.from("insights").delete().in("id", insightIds)).error) throw fail();
        }
        if (threadIds.length && (await supabase.from("qa_threads").delete().in("id", threadIds)).error) throw fail();

        const paths = (docs ?? []).map((d) => d.storage_path as string);
        if (paths.length) {
          const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
          if (error) throw Object.assign(new Error("storage delete failed"), { code: "storage_delete_failed" });
        }
        // Claim files on this policy go with it (rows cascade); their evidence files are removed here.
        const { data: claims } = await supabase.from("claims").select("id").eq("policy_id", policyId);
        const evidence = await evidencePaths(supabase, (claims ?? []).map((c) => c.id as string));
        if (evidence.length) {
          const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove(evidence);
          if (error) throw Object.assign(new Error("storage delete failed"), { code: "storage_delete_failed" });
        }
        // Chunks and extractions cascade from documents; policy-scoped threads cascade from the policy.
        if (docs?.length && (await supabase.from("documents").delete().in("id", docs.map((d) => d.id))).error) throw fail();
        const { data: gone, error } = await supabase.from("policies").delete().eq("id", policyId).select("id");
        if (error || !gone?.length) throw fail();

        return { documents: docs?.length ?? 0, threads: threadIds.length, insights: insightIds.length };
      },
      (c) => ({ policy_id: policyId, document_count: c.documents, thread_count: c.threads, insight_count: c.insights }),
    );
    await run.finish("succeeded");
    return counts;
  } catch {
    await run.finish("failed");
    throw new ServiceError("delete_failed", "We couldn't delete this policy completely. Please try again.", 500);
  }
}

/** Deletes an uploaded document that hasn't been confirmed as a policy (e.g. a failed or abandoned upload). */
export async function deleteUnconfirmedDocument(supabase: SupabaseClient, userId: string, documentId: string) {
  const { data: doc } = await supabase.from("documents").select("id, storage_path, policy_id").eq("id", documentId).maybeSingle();
  if (!doc) throw new ServiceError("not_found", "Document not found.", 404);
  if (doc.policy_id) throw new ServiceError("has_policy", "This document belongs to a confirmed policy. Delete the policy instead.", 409);

  const run = await RunLogger.start(supabase, userId, "action");
  try {
    await run.step(
      "user_deleted_document",
      async () => {
        await supabase.storage.from(STORAGE_BUCKET).remove([doc.storage_path]); // may already be gone after a failed parse
        const { data, error } = await supabase.from("documents").delete().eq("id", documentId).select("id");
        if (error || !data?.length) throw Object.assign(new Error("delete failed"), { code: "db_delete_failed" });
      },
      { document_id: documentId },
    );
    await run.finish("succeeded");
  } catch {
    await run.finish("failed");
    throw new ServiceError("delete_failed", "We couldn't delete this document. Please try again.", 500);
  }
}
