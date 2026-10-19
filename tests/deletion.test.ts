// Integration test against the REAL Supabase project: deleting a policy removes the PDF, text,
// extractions, policy chats, all-policies chats that quoted it, and findings/tasks based on it,
// while leaving the user's other data alone. Skipped without Supabase credentials.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { deletePolicy } from "@/lib/deletion";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anon && service);
const BUCKET = "policy-pdfs";
if (!configured && process.env.REQUIRE_SUPABASE_TESTS === "1") throw new Error("[deletion.test] Supabase credentials are required but missing");

describe.skipIf(!configured)("deletePolicy", () => {
  let admin: SupabaseClient;
  let client: SupabaseClient;
  let userId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    const email = `delete-test-${Date.now()}@example.test`;
    const password = `Test-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error;
    userId = data.user.id;
    client = createClient(url!, anon!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });

    const one = async (table: string, row: Record<string, unknown>) => {
      const r = await client.from(table).insert({ user_id: userId, ...row }).select("id").single();
      if (r.error) throw new Error(`${table}: ${r.error.message}`);
      return r.data.id as string;
    };
    // Policy to delete, and a second policy that must survive.
    ids.policy = await one("policies", { policy_type: "travel", display_name: "To delete" });
    ids.keep = await one("policies", { policy_type: "gadget", display_name: "Keep me" });
    ids.doc = crypto.randomUUID();
    ids.path = `${userId}/${ids.doc}.pdf`;
    const up = await client.storage
      .from(BUCKET)
      .upload(ids.path, readFileSync(join(process.cwd(), "samples", "travel.pdf")), { contentType: "application/pdf" });
    if (up.error) throw up.error;
    await one("documents", { id: ids.doc, policy_id: ids.policy, file_name: "t.pdf", storage_path: ids.path, processing_status: "extracted" });
    ids.chunk = await one("document_chunks", { document_id: ids.doc, policy_id: ids.policy, page_number: 1, chunk_index: 0, text: "FICTIONAL text" });
    ids.extraction = await one("policy_extractions", {
      document_id: ids.doc,
      policy_id: ids.policy,
      raw_extraction_json: {},
      extraction_version: "test",
      model: "test",
    });
    ids.policyThread = await one("qa_threads", { policy_id: ids.policy });
    ids.walletThread = await one("qa_threads", { policy_id: null });
    ids.otherWalletThread = await one("qa_threads", { policy_id: null });
    await one("qa_messages", {
      thread_id: ids.walletThread,
      role: "assistant",
      content: "answer",
      citations_json: [{ policy_id: ids.policy, page: 1, quote: "FICTIONAL text" }],
    });
    await one("qa_messages", { thread_id: ids.otherWalletThread, role: "assistant", content: "other", citations_json: [{ policy_id: ids.keep }] });
    ids.insight = await one("insights", {
      insight_type: "exclusion",
      fingerprint: "del-1",
      title: "t",
      explanation: "e",
      evidence_json: { evidence: [], policy_ids: [ids.policy] },
    });
    ids.otherInsight = await one("insights", {
      insight_type: "exclusion",
      fingerprint: "del-2",
      title: "t",
      explanation: "e",
      evidence_json: { evidence: [], policy_ids: [ids.keep] },
    });
    ids.task = await one("action_items", { insight_id: ids.insight, title: "task" });
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  });

  it("removes everything derived from the policy and nothing else", async () => {
    const counts = await deletePolicy(client, userId, ids.policy);
    expect(counts).toEqual({ documents: 1, threads: 1, insights: 1 });

    const gone = async (table: string, id: string) => (await admin.from(table).select("id").eq("id", id)).data ?? [];
    for (const [table, id] of [
      ["policies", ids.policy],
      ["documents", ids.doc],
      ["document_chunks", ids.chunk],
      ["policy_extractions", ids.extraction],
      ["qa_threads", ids.policyThread],
      ["qa_threads", ids.walletThread],
      ["insights", ids.insight],
      ["action_items", ids.task],
    ]) {
      expect(await gone(table, id), `${table} should be deleted`).toEqual([]);
    }
    const file = await admin.storage.from(BUCKET).download(ids.path);
    expect(file.data, "PDF should be deleted from storage").toBeNull();

    for (const [table, id] of [
      ["policies", ids.keep],
      ["qa_threads", ids.otherWalletThread],
      ["insights", ids.otherInsight],
    ]) {
      expect(await gone(table, id), `${table} should be kept`).toHaveLength(1);
    }
  });

  it("logs the deletion with ids and counts only", async () => {
    const { data: runs } = await admin.from("agent_runs").select("id").eq("user_id", userId).eq("workflow", "action");
    const { data: steps } = await admin.from("agent_steps").select("step_name, metadata").in("run_id", (runs ?? []).map((r) => r.id));
    const step = (steps ?? []).find((s) => s.step_name === "user_deleted_policy");
    expect(step?.metadata).toEqual({ policy_id: ids.policy, document_count: 1, thread_count: 1, insight_count: 1 });
  });
});
