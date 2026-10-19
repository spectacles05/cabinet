// Integration test against the REAL Supabase project, in Demo Mode: Reset demo, upload processing,
// reading (sample and non-sample), prepared and unsupported questions, and the coverage review all
// run end to end with ZERO calls to the Anthropic API. Three independent tripwires: the client gate
// is spied on, the SDK is pointed at a local trap server, and fetch is watched for anthropic.com.
// Skipped without Supabase credentials.
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { anthropicFetchCount, startAnthropicTrap, type AnthropicTrap } from "./helpers/anthropic-trap";

const gate = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/ai/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai/client")>();
  return {
    ...real,
    getAnthropic: async () => {
      gate.calls++;
      return real.getAnthropic();
    },
  };
});

import { resetDemoWallet } from "@/lib/demo/reset";
import { askQuestion } from "@/lib/qa/service";
import { runAudit } from "@/lib/audit/service";
import { attachDocumentToPolicy, processStoredDocument, registerUpload } from "@/lib/ingest";
import { runExtraction } from "@/lib/extraction/service";
import { autoAddToWallet } from "@/lib/extraction/confirm";
import { getPolicies } from "@/lib/policies";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anon && service);
if (!configured && process.env.REQUIRE_SUPABASE_TESTS === "1") throw new Error("[demo-workflows.test] Supabase credentials are required but missing");

describe.skipIf(!configured)("Demo Mode workflows make zero Anthropic calls", () => {
  let admin: SupabaseClient;
  let client: SupabaseClient;
  let userId: string;
  let trap: AnthropicTrap;
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const savedMode = process.env.CABINET_MODE;

  beforeAll(async () => {
    process.env.CABINET_MODE = "demo";
    trap = await startAnthropicTrap();
    process.env.ANTHROPIC_BASE_URL = trap.url;
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    const email = `demo-test-${Date.now()}@example.test`;
    const password = `Test-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error;
    userId = data.user.id;
    client = createClient(url!, anon!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });
  }, 60_000);

  afterAll(async () => {
    if (userId) {
      const { data: files } = await admin.storage.from("policy-pdfs").list(userId);
      if (files?.length) await admin.storage.from("policy-pdfs").remove(files.map((f) => `${userId}/${f.name}`));
      await admin.auth.admin.deleteUser(userId);
    }
    await trap?.close();
    fetchSpy.mockRestore();
    if (savedMode === undefined) delete process.env.CABINET_MODE;
    else process.env.CABINET_MODE = savedMode;
  });

  it("Reset demo restores the three fictional policies, read from prepared readings", async () => {
    const { policyIds } = await resetDemoWallet(client, userId);
    expect(policyIds).toHaveLength(3);
    const policies = await getPolicies(client);
    expect(policies.map((p) => p.policy_type).sort()).toEqual(["contents", "gadget", "travel"]);
    expect(policies.every((p) => p.reviewed?.engine === "demo")).toBe(true);
    expect(policies.find((p) => p.policy_type === "travel")?.insurer).toBe("Harbourlight Travel Insurance (Fictional) Ltd");
  }, 120_000);

  it("resetting again starts from a clean slate (no duplicates)", async () => {
    await resetDemoWallet(client, userId);
    expect(await getPolicies(client)).toHaveLength(3);
  }, 120_000);

  it("prepared questions get cited, verified answers", async () => {
    const r = await askQuestion(client, userId, { question: "Am I covered if I ski off-piste without a guide?", policyId: null, threadId: null });
    expect(r.answer.engine).toBe("demo");
    expect(r.answer.assessment).toBe("excluded");
    expect(r.answer.citations.length).toBeGreaterThan(0);
    expect(r.answer.rejected_citations).toBe(0);
  }, 60_000);

  it("unsupported questions are told the demo is limited, not given a made-up answer", async () => {
    const r = await askQuestion(client, userId, { question: "Can I get cover for my pet tortoise?", policyId: null, threadId: null });
    expect(r.answer.engine).toBe("demo");
    expect(r.answer.assessment).toBe("insufficient_evidence");
    expect(r.answer.headline).toBe("Demo Mode can't answer that one.");
    expect(r.answer.answer).toContain("only answer a few prepared questions");
    expect(r.answer.citations).toEqual([]);
  }, 60_000);

  it("the coverage review runs on rule-based checks and finds the winter sports gap", async () => {
    const r = await runAudit(client, userId);
    expect(r.findingCount).toBeGreaterThan(0);
    const { data } = await client.from("insights").select("title, model");
    expect(data?.some((i) => /Winter Sports/i.test(i.title as string))).toBe(true);
    expect(data?.every((i) => !String(i.model).startsWith("claude"))).toBe(true);
    // Routine exclusions aren't flagged; cover the user may not need waits on one plain question.
    const { data: rows } = await client.from("insights").select("title, insight_type, evidence_json");
    expect(rows?.some((i) => /unattended|forced entry|pre-existing/i.test(i.title as string))).toBe(false);
    expect(rows?.some((i) => (i.evidence_json as { relevance_question?: string }).relevance_question === "Do you ski or snowboard?")).toBe(true);
  }, 60_000);

  it("adding the missing PP1 schedule to the contents policy clears its 'A document is missing' note", async () => {
    const contents = (await getPolicies(client)).find((p) => p.policy_type === "contents")!;
    const note = () => client.from("insights").select("id").eq("fingerprint", `missing:${contents.id}`).maybeSingle();
    expect((await note()).data).not.toBeNull();

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage();
    page.drawText("Endorsement Schedule PP1", { x: 50, y: 760, size: 16, font });
    page.drawText("Personal Possessions (away from home): one laptop, value GBP 900, covered anywhere in the UK.", { x: 50, y: 730, size: 10, font });
    const bytes = await pdf.save();
    const reg = await registerUpload(client, userId, { fileName: "schedule-pp1.pdf", sizeBytes: bytes.byteLength, contentType: "application/pdf" });
    const up = await client.storage.from("policy-pdfs").upload(reg.storagePath, new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), { contentType: "application/pdf" });
    expect(up.error).toBeNull();
    await processStoredDocument(client, userId, reg.documentId, reg.runId);
    await attachDocumentToPolicy(client, userId, contents.id, reg.documentId);

    expect((await note()).data).toBeNull();
    const { data: steps } = await client.from("agent_steps").select("metadata").eq("step_name", "check_missing_document_note");
    expect(steps?.some((s) => (s.metadata as { completed?: boolean }).completed === true)).toBe(true);
  }, 60_000);

  it("your own (non-sample) PDF is read by the free rule-based reader", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage();
    page.drawText("My Home Insurance Schedule", { x: 50, y: 760, size: 16, font });
    page.drawText("Insurer Example Mutual Ltd. Policy number EXM-0042. Standard excess GBP 250 per claim.", { x: 50, y: 730, size: 10, font });
    const bytes = await pdf.save();
    const reg = await registerUpload(client, userId, { fileName: "my-home.pdf", sizeBytes: bytes.byteLength, contentType: "application/pdf" });
    const up = await client.storage.from("policy-pdfs").upload(reg.storagePath, new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), { contentType: "application/pdf" });
    expect(up.error).toBeNull();
    await processStoredDocument(client, userId, reg.documentId, reg.runId);
    const ex = await runExtraction(client, userId, reg.documentId);
    expect(ex.verified.engine).toBe("rules");
    await autoAddToWallet(client, userId, reg.documentId);
  }, 60_000);

  it("Reset demo is refused outside Demo Mode", async () => {
    process.env.CABINET_MODE = "live";
    await expect(resetDemoWallet(client, userId)).rejects.toMatchObject({ status: 403 });
    process.env.CABINET_MODE = "demo";
  });

  it("…and across all of that, not one call to the Anthropic API", () => {
    expect(gate.calls).toBe(0);
    expect(trap.hits()).toBe(0);
    expect(anthropicFetchCount(fetchSpy)).toBe(0);
  });
});
