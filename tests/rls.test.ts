// Cross-tenant isolation tests against the REAL Supabase project.
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY. Skipped (with a notice) when those are missing.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anon && service && !url.includes("your-project-ref"));

if (!configured) {
  // `npm run test:security` sets REQUIRE_SUPABASE_TESTS so isolation tests can never be skipped silently.
  if (process.env.REQUIRE_SUPABASE_TESTS === "1") throw new Error("[rls.test] Supabase credentials are required but missing");
  console.warn("[rls.test] Skipped: Supabase credentials not set in .env.local");
}

const BUCKET = "policy-pdfs";
const password = `Test-${crypto.randomUUID()}`;
const stamp = Date.now();

type TestUser = { id: string; email: string; client: SupabaseClient };

describe.skipIf(!configured)("tenant isolation (RLS + private storage)", () => {
  let admin: SupabaseClient;
  let a: TestUser;
  let b: TestUser;
  let aDocId: string;
  let aPath: string;
  let aThreadId: string;
  let aInsightId: string;

  async function makeUser(label: string): Promise<TestUser> {
    const email = `rls-${label}-${stamp}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("createUser failed");
    const client = createClient(url!, anon!, { auth: { persistSession: false } });
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
    if (signInErr) throw signInErr;
    return { id: data.user.id, email, client };
  }

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    a = await makeUser("a");
    b = await makeUser("b");

    // User A uploads a document through their own (RLS-bound) client.
    aDocId = crypto.randomUUID();
    aPath = `${a.id}/${aDocId}.pdf`;
    const pdf = readFileSync(join(process.cwd(), "samples", "travel.pdf"));
    const up = await a.client.storage.from(BUCKET).upload(aPath, pdf, { contentType: "application/pdf" });
    expect(up.error).toBeNull();
    const ins = await a.client.from("documents").insert({
      id: aDocId,
      user_id: a.id,
      file_name: "travel.pdf",
      storage_path: aPath,
      size_bytes: pdf.byteLength,
      processing_status: "parsed",
    });
    expect(ins.error).toBeNull();
    const chunk = await a.client.from("document_chunks").insert({
      user_id: a.id,
      document_id: aDocId,
      page_number: 1,
      chunk_index: 0,
      text: "FICTIONAL SAMPLE test chunk",
    });
    expect(chunk.error).toBeNull();
    const run = await a.client.from("agent_runs").insert({ user_id: a.id, workflow: "ingest" });
    expect(run.error).toBeNull();
    const thread = await a.client.from("qa_threads").insert({ user_id: a.id, policy_id: null }).select("id").single();
    expect(thread.error).toBeNull();
    aThreadId = thread.data!.id;
    const insight = await a.client
      .from("insights")
      .insert({
        user_id: a.id,
        insight_type: "renewal_due",
        fingerprint: `test-${stamp}`,
        title: "Test finding",
        explanation: "Test",
        evidence_json: { evidence: [] },
      })
      .select("id")
      .single();
    expect(insight.error).toBeNull();
    aInsightId = insight.data!.id;
    const msg = await a.client
      .from("qa_messages")
      .insert({ user_id: a.id, thread_id: aThreadId, role: "user", content: "Am I covered for off-piste skiing?" });
    expect(msg.error).toBeNull();
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.storage.from(BUCKET).remove([aPath]).catch(() => {});
    for (const u of [a, b]) if (u) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  });

  it("owner can read their own rows and file", async () => {
    const { data } = await a.client.from("documents").select("id").eq("id", aDocId);
    expect(data).toHaveLength(1);
    const dl = await a.client.storage.from(BUCKET).download(aPath);
    expect(dl.error).toBeNull();
  });

  it("another user sees zero rows in every table", async () => {
    for (const table of [
      "documents",
      "document_chunks",
      "agent_runs",
      "agent_steps",
      "policies",
      "policy_extractions",
      "qa_threads",
      "qa_messages",
      "insights",
      "action_items",
    ]) {
      const { data, error } = await b.client.from(table).select("id");
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
  });

  it("another user cannot download or list the owner's PDF", async () => {
    const dl = await b.client.storage.from(BUCKET).download(aPath);
    expect(dl.data).toBeNull();
    expect(dl.error).not.toBeNull();
    const list = await b.client.storage.from(BUCKET).list(a.id);
    expect(list.data ?? []).toEqual([]);
  });

  it("another user cannot write into the owner's folder or rows", async () => {
    const up = await b.client.storage
      .from(BUCKET)
      .upload(`${a.id}/intruder.pdf`, new Uint8Array([37, 80, 68, 70]), { contentType: "application/pdf" });
    expect(up.error).not.toBeNull();

    const spoof = await b.client.from("documents").insert({
      user_id: a.id,
      file_name: "spoof.pdf",
      storage_path: `${a.id}/spoof.pdf`,
    });
    expect(spoof.error).not.toBeNull();

    const upd = await b.client.from("documents").update({ file_name: "hacked.pdf" }).eq("id", aDocId).select("id");
    expect(upd.data ?? []).toEqual([]);
    const del = await b.client.from("documents").delete().eq("id", aDocId).select("id");
    expect(del.data ?? []).toEqual([]);
  });

  it("a user cannot link their row to another user's document", async () => {
    const res = await b.client.from("document_chunks").insert({
      user_id: b.id,
      document_id: aDocId,
      page_number: 1,
      chunk_index: 99,
      text: "cross-link attempt",
    });
    expect(res.error).not.toBeNull();
  });

  it("full-text search never returns another user's passages", async () => {
    const own = await a.client.rpc("search_chunks", { query_terms: ["fictional sample"] });
    expect(own.error).toBeNull();
    expect((own.data ?? []).length).toBeGreaterThan(0);
    const other = await b.client.rpc("search_chunks", { query_terms: ["fictional sample"] });
    expect(other.error).toBeNull();
    expect(other.data ?? []).toEqual([]);
  });

  it("another user cannot post into the owner's Q&A thread", async () => {
    const res = await b.client
      .from("qa_messages")
      .insert({ user_id: b.id, thread_id: aThreadId, role: "user", content: "injected" });
    expect(res.error).not.toBeNull();
  });

  it("another user cannot change the owner's findings or attach tasks to them", async () => {
    const upd = await b.client.from("insights").update({ status: "dismissed" }).eq("id", aInsightId).select("id");
    expect(upd.data ?? []).toEqual([]);
    const task = await b.client.from("action_items").insert({ user_id: b.id, insight_id: aInsightId, title: "hijack" });
    expect(task.error).not.toBeNull();
    const { data } = await a.client.from("insights").select("status").eq("id", aInsightId).single();
    expect(data?.status).toBe("open");
  });

  it("a signed-out visitor gets nothing", async () => {
    const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
    const { data } = await anonClient.from("documents").select("id");
    expect(data ?? []).toEqual([]);
    const dl = await anonClient.storage.from(BUCKET).download(aPath);
    expect(dl.data).toBeNull();
    const search = await anonClient.rpc("search_chunks", { query_terms: ["fictional sample"] });
    expect(search.data ?? []).toEqual([]);
  });

  it("the original document is unchanged after the attacks", async () => {
    const { data } = await a.client.from("documents").select("file_name").eq("id", aDocId).single();
    expect(data?.file_name).toBe("travel.pdf");
  });
});
