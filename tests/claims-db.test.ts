// Claims preparation against the REAL Supabase project (fictional sample policies, Demo Mode, so no
// AI credits): the whole journey, user confirmation, missing information, uncertain cover, a tampered
// summary, cross-user isolation, and failed operations. Skipped without Supabase credentials.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resetDemoWallet } from "@/lib/demo/reset";
import { getPolicies } from "@/lib/policies";
import {
  checkClaim,
  deleteClaim,
  getClaim,
  listClaims,
  recheckClaim,
  saveClaim,
  setChecklistItem,
  setClaimStatus,
  startClaim,
  updateClaimDetails,
  type ClaimDraft,
} from "@/lib/claims/service";
import { confirmEvidence, deleteEvidence, evidenceUrl, listEvidence, registerEvidence } from "@/lib/claims/evidence";
import { askQuestion, getLatestThread } from "@/lib/qa/service";
import { remainingQuestions } from "@/lib/claims/questions";
import type { ClaimAssessment } from "@/lib/claims/types";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && anon && service);

describe.skipIf(!configured)("claims preparation (real database)", () => {
  let admin: SupabaseClient;
  const users: { id: string; client: SupabaseClient }[] = [];
  let a: { id: string; client: SupabaseClient };
  let b: { id: string; client: SupabaseClient };
  // A local stand-in for the Anthropic API (the app keeps one client, so one address for every test).
  // It answers "bad request" (a real failure) or "overloaded" (temporarily unavailable).
  let ai: Server;
  let aiReply: 400 | 529 = 400;
  let aiHits = 0;
  let gadgetId = "";
  let contentsId = "";
  let savedId = "";
  const env = { mode: process.env.CABINET_MODE, base: process.env.ANTHROPIC_BASE_URL, key: process.env.ANTHROPIC_API_KEY };

  async function newUser() {
    const email = `claims-test-${Date.now()}-${users.length}@example.test`;
    const password = `Test-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw error;
    const client = createClient(url!, anon!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });
    const u = { id: data.user.id, client };
    users.push(u);
    return u;
  }

  beforeAll(async () => {
    process.env.CABINET_MODE = "demo";
    ai = createServer((req, res) => {
      aiHits++;
      req.resume();
      res.writeHead(aiReply, { "content-type": "application/json" });
      const error = aiReply === 529 ? { type: "overloaded_error", message: "overloaded" } : { type: "invalid_request_error", message: "stand-in" };
      res.end(JSON.stringify({ type: "error", error }));
    });
    await new Promise<void>((resolve) => ai.listen(0, "127.0.0.1", resolve));
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(ai.address() as AddressInfo).port}`;
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    const probe = await admin.from("claims").select("id").limit(1);
    if (probe.error) throw new Error(`The claims table is missing: run supabase/migrations/0004_claims.sql in the Supabase SQL Editor (${probe.error.message})`);
    a = await newUser();
    b = await newUser();
    await resetDemoWallet(a.client, a.id);
    const policies = await getPolicies(a.client);
    gadgetId = policies.find((p) => p.policy_type === "gadget")!.id;
    contentsId = policies.find((p) => p.policy_type === "contents")!.id;
  }, 180_000);

  afterAll(async () => {
    for (const u of users) {
      const { data: files } = await admin.storage.from("policy-pdfs").list(u.id);
      if (files?.length) await admin.storage.from("policy-pdfs").remove(files.map((f) => `${u.id}/${f.name}`));
      await admin.auth.admin.deleteUser(u.id);
    }
    await new Promise((resolve) => (ai ? ai.close(() => resolve(null)) : resolve(null)));
    for (const [k, v] of [["CABINET_MODE", env.mode], ["ANTHROPIC_BASE_URL", env.base], ["ANTHROPIC_API_KEY", env.key]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const count = async (client: SupabaseClient) => (await client.from("claims").select("id", { count: "exact", head: true })).count ?? 0;

  it("describe → check cover → answer questions → review → confirm → save → return", async () => {
    // 1. Describe it in your own words.
    const { triage } = await startClaim(a.client, a.id, { description: "Someone smashed my car window yesterday and stole my phone", policyId: null });
    expect(triage).toMatchObject({ incident_type: "theft", item: "phone", policy_id: gadgetId });
    expect(triage.prefilled).toMatchObject({ where: "vehicle", forced_entry: "yes" });

    // 2. Only the questions that are still open.
    expect(remainingQuestions(triage.incident_type, triage.prefilled).map((q) => q.id)).toEqual(["police", "evidence"]);
    const draft: ClaimDraft = {
      description: "Someone smashed my car window yesterday and stole my phone",
      policyId: triage.policy_id!,
      incident_type: triage.incident_type,
      item: triage.item,
      title: triage.title,
      answers: { ...triage.prefilled, police: "no", evidence: ["receipt"] },
    };

    // 3. The policy check, cited, with the deadline that matters.
    const { assessment } = await checkClaim(a.client, a.id, draft);
    expect(assessment.engine).toBe("demo");
    expect(assessment.verdict).toBe("conditional");
    expect(assessment.deadlines[0]).toMatchObject({ action: "Report it to the police", hours: 48 });
    expect(assessment.checklist.find((c) => c.label === "Police crime reference number")?.source).toBe("policy");
    expect(assessment.contacts).toEqual([]);
    expect(await count(a.client)).toBe(0); // nothing is saved before confirmation

    // 4. Without explicit confirmation, nothing is saved.
    await expect(saveClaim(a.client, a.id, { ...draft, assessment, confirmed: false })).rejects.toMatchObject({ code: "confirmation_required" });
    expect(await count(a.client)).toBe(0);

    // 5. Confirm → saved.
    const { claimId } = await saveClaim(a.client, a.id, { ...draft, assessment, confirmed: true });
    savedId = claimId;
    const row = await getClaim(a.client, claimId);
    expect(row).toMatchObject({ status: "preparing", incident_type: "theft", policy_id: gadgetId });
    expect(row!.checklist_json.length).toBeGreaterThan(1);

    // 6. Come back later: it's listed, progress can be updated, status changes need confirmation.
    expect((await listClaims(a.client)).map((c) => c.id)).toContain(claimId);
    const first = row!.checklist_json[0];
    const updated = await setChecklistItem(a.client, a.id, claimId, first.id, true);
    expect(updated.find((c) => c.id === first.id)?.done).toBe(true);
    await expect(setClaimStatus(a.client, a.id, claimId, "submitted", false)).rejects.toMatchObject({ code: "confirmation_required" });
    await setClaimStatus(a.client, a.id, claimId, "submitted", true);
    expect((await getClaim(a.client, claimId))?.status).toBe("submitted");

    // The execution log shows the decisions and actions, without the user's words.
    const { data: runs } = await a.client.from("agent_runs").select("id").in("workflow", ["claim", "action"]);
    const { data: steps } = await a.client.from("agent_steps").select("step_name, metadata").in("run_id", (runs ?? []).map((r) => r.id));
    const names = (steps ?? []).map((s) => s.step_name);
    for (const n of ["understand_incident_rules", "check_policy_rules", "verify_claim_evidence", "await_user_confirmation", "user_confirmed_summary", "save_claim", "update_checklist", "user_changed_status"]) {
      expect(names).toContain(n);
    }
    expect(JSON.stringify(steps)).not.toMatch(/smashed|window|phone/i);
  }, 120_000);

  it("missing information: the policy isn't checked until the essential questions are answered", async () => {
    await expect(
      checkClaim(a.client, a.id, { description: "My phone was stolen", policyId: gadgetId, incident_type: "theft", item: "phone", title: "Stolen phone", answers: { when: "unknown" } }),
    ).rejects.toMatchObject({ code: "missing_information", missing: ["where", "police", "evidence"] });
  });

  it("uncertain cover is said plainly, never as a yes", async () => {
    const { assessment } = await checkClaim(a.client, a.id, {
      description: "My laptop was stolen from a café",
      policyId: contentsId,
      incident_type: "theft",
      item: "laptop",
      title: "Stolen laptop",
      answers: { when: "unknown", where: "away", unattended: "no", police: "yes", evidence: [] },
    });
    expect(assessment.verdict).toBe("unclear");
    expect(assessment.headline).toMatch(/can't confirm/i);
    expect(assessment.facts.some((f) => f.certainty === "uncertain")).toBe(true);
    expect(assessment.deadlines.every((d) => d.due_date === null)).toBe(true);
  }, 60_000);

  it("a tampered summary is checked again on save: invented wording and contacts are not stored", async () => {
    const draft: ClaimDraft = {
      description: "My phone was stolen at the gym",
      policyId: gadgetId,
      incident_type: "theft",
      item: "phone",
      title: "Stolen phone",
      answers: { when: "unknown", where: "away", unattended: "no", police: "yes", evidence: [] },
    };
    const { assessment } = await checkClaim(a.client, a.id, draft);
    const forged: ClaimAssessment = {
      ...assessment,
      verdict: "likely_covered",
      headline: "Your claim is guaranteed to be paid.",
      facts: [...assessment.facts, { kind: "cover", text: "Orbit pays every phone claim in full.", certainty: "confirmed", citation: { document_id: assessment.facts[0]?.citation?.document_id ?? "x", page: 2, quote: "We pay every phone claim in full, no questions asked." } }],
      contacts: [{ label: "Claims line", value: "0800 000 1234", source: "policy", citation: { document_id: "x", page: 1, quote: "Call 0800 000 1234" } }],
    };
    const { claimId } = await saveClaim(a.client, a.id, { ...draft, assessment: forged, confirmed: true });
    const row = await getClaim(a.client, claimId);
    expect(row!.assessment_json.headline).not.toMatch(/guarantee/i);
    expect(row!.assessment_json.facts.map((f) => f.text)).not.toContain("Orbit pays every phone claim in full.");
    expect(row!.assessment_json.contacts).toEqual([]);
  }, 60_000);

  it("cross-user isolation: another user can't see, change, delete or attach to someone else's claim", async () => {
    expect(savedId).not.toBe("");
    expect(await getClaim(b.client, savedId)).toBeNull();
    expect(await listClaims(b.client)).toEqual([]);
    const upd = await b.client.from("claims").update({ status: "closed" }).eq("id", savedId).select("id");
    expect(upd.data ?? []).toEqual([]);
    const del = await b.client.from("claims").delete().eq("id", savedId).select("id");
    expect(del.data ?? []).toEqual([]);
    await expect(setChecklistItem(b.client, b.id, savedId, "c1", true)).rejects.toMatchObject({ code: "not_found" });
    await expect(setClaimStatus(b.client, b.id, savedId, "closed", true)).rejects.toMatchObject({ code: "not_found" });
    // Not even by naming the other user's policy.
    await expect(startClaim(b.client, b.id, { description: "My phone was stolen", policyId: gadgetId })).rejects.toMatchObject({ status: 409 });
    await expect(
      checkClaim(b.client, b.id, { description: "My phone was stolen", policyId: gadgetId, incident_type: "theft", item: "phone", title: "x", answers: { when: "unknown", where: "away", unattended: "no", police: "no", evidence: [] } }),
    ).rejects.toMatchObject({ code: "not_found" });
    const base = { title: "x", description: "xxx", incident_type: "theft", assessment_json: {}, confirmed_at: new Date().toISOString() };
    expect((await b.client.from("claims").insert({ ...base, user_id: b.id, policy_id: gadgetId })).error).not.toBeNull();
    expect((await b.client.from("claims").insert({ ...base, user_id: a.id, policy_id: gadgetId })).error).not.toBeNull();
    // A's claim is untouched.
    expect((await getClaim(a.client, savedId))?.status).toBe("submitted");
  }, 60_000);

  it("failed operations: a failed save leaves nothing behind and is logged as failed", async () => {
    const draft: ClaimDraft = {
      description: "My phone was stolen at the gym",
      policyId: gadgetId,
      incident_type: "theft",
      item: "phone",
      title: "Stolen phone",
      answers: { when: "unknown", where: "away", unattended: "no", police: "yes", evidence: [] },
    };
    const { assessment } = await checkClaim(a.client, a.id, draft);
    const before = await count(a.client);
    // The database rejects the insert (simulated): the user gets a clear error, nothing is saved.
    const failing = new Proxy(a.client, {
      get(target, prop, recv) {
        if (prop === "from") {
          return (table: string) =>
            table === "claims"
              ? { insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "simulated failure" } }) }) }) }
              : target.from(table);
        }
        return Reflect.get(target, prop, recv);
      },
    });
    await expect(saveClaim(failing, a.id, { ...draft, assessment, confirmed: true })).rejects.toMatchObject({ code: "save_failed" });
    expect(await count(a.client)).toBe(before);
    const { data: run } = await a.client.from("agent_runs").select("id, status").eq("workflow", "claim").order("started_at", { ascending: false }).limit(1).single();
    expect(run?.status).toBe("failed");
    const { data: steps } = await a.client.from("agent_steps").select("step_name, status, metadata").eq("run_id", run!.id);
    expect(steps?.find((s) => s.step_name === "save_claim")).toMatchObject({ status: "failed", metadata: { error_code: "db_insert_failed" } });

    // A policy deleted in the meantime: refused, nothing saved.
    await expect(saveClaim(a.client, a.id, { ...draft, policyId: crypto.randomUUID(), assessment, confirmed: true })).rejects.toMatchObject({ code: "not_found" });
  }, 60_000);

  it("failed operations: when the live AI errors, the user gets a clear message and nothing is saved", async () => {
    process.env.CABINET_MODE = "live";
    process.env.ANTHROPIC_API_KEY ||= "test-key";
    const before = await count(a.client);
    await expect(
      checkClaim(a.client, a.id, { description: "My phone was stolen", policyId: gadgetId, incident_type: "theft", item: "phone", title: "x", answers: { when: "unknown", where: "away", unattended: "no", police: "no", evidence: [] } }),
    ).rejects.toMatchObject({ code: "claim_failed", status: 502 });
    expect(aiHits).toBeGreaterThan(0); // it really tried (against the local stand-in)
    expect(await count(a.client)).toBe(before);
    process.env.CABINET_MODE = "demo";
  }, 60_000);

  it("failed operations: when the live AI is unavailable, the check falls back to the rule-based reader", async () => {
    aiReply = 529;
    process.env.CABINET_MODE = "live";
    process.env.ANTHROPIC_API_KEY ||= "test-key";
    try {
      const { assessment } = await checkClaim(a.client, a.id, {
        description: "My phone was stolen",
        policyId: gadgetId,
        incident_type: "theft",
        item: "phone",
        title: "x",
        answers: { when: "unknown", where: "away", unattended: "no", police: "no", evidence: [] },
      });
      expect(assessment.engine).toBe("rules");
      expect(assessment.deadlines[0]?.hours).toBe(48);
    } finally {
      process.env.CABINET_MODE = "demo";
      aiReply = 400;
    }
  }, 90_000);

  // ───────────── Claim files: evidence, edits, re-check, Ask ─────────────

  // A real 1×1 PNG.
  const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
  const folder = async (userId: string, claimId: string) => ((await admin.storage.from("claim-evidence").list(`${userId}/${claimId}`)).data ?? []).map((f) => f.name);

  async function addFile(u: { id: string; client: SupabaseClient }, claimId: string, name: string, type: string, bytes: Uint8Array, itemId?: string) {
    const reg = await registerEvidence(u.client, u.id, claimId, { fileName: name, sizeBytes: bytes.byteLength, contentType: type, checklistItemId: itemId ?? null });
    const up = await u.client.storage.from("claim-evidence").upload(reg.storagePath, new Blob([new Uint8Array(bytes)], { type }), { contentType: type });
    expect(up.error).toBeNull();
    return { reg, confirmed: await confirmEvidence(u.client, u.id, claimId, reg.evidenceId) };
  }

  it("evidence is kept privately with the claim file, checked, viewable, and removable", async () => {
    const claim = (await getClaim(a.client, savedId))!;
    const item = claim.checklist_json.find((c) => !c.done)!;
    // Added from a checklist step: the step is ticked.
    const { reg, confirmed } = await addFile(a, savedId, "till-receipt.png", "image/png", PNG, item.id);
    expect(confirmed.evidence.kind).toBe("receipt");
    expect(confirmed.checklist?.find((c) => c.id === item.id)?.done).toBe(true);
    // Persists: listed when the claim file is opened again, and openable through a private link.
    expect((await listEvidence(a.client, savedId)).map((e) => e.file_name)).toEqual(["till-receipt.png"]);
    expect((await getClaim(a.client, savedId))!.checklist_json.find((c) => c.id === item.id)?.done).toBe(true);
    expect(await evidenceUrl(a.client, savedId, reg.evidenceId)).toMatch(/^https?:\/\/.+token=/);
    expect(await folder(a.id, savedId)).toHaveLength(1);

    // A file pretending to be a photo is refused and nothing is kept.
    await expect(addFile(a, savedId, "photo.jpg", "image/jpeg", new TextEncoder().encode("MZ this is not a jpeg"))).rejects.toMatchObject({ code: "unsupported_type" });
    expect((await listEvidence(a.client, savedId)).length).toBe(1);
    expect(await folder(a.id, savedId)).toHaveLength(1);
    await expect(registerEvidence(a.client, a.id, savedId, { fileName: "run.exe", sizeBytes: 10, contentType: "application/octet-stream" })).rejects.toMatchObject({ status: 415 });

    // Another user can't see, open, remove or add to it, even by naming the path.
    expect(await listEvidence(b.client, savedId)).toEqual([]);
    expect(await evidenceUrl(b.client, savedId, reg.evidenceId)).toBeNull();
    await expect(deleteEvidence(b.client, b.id, savedId, reg.evidenceId)).rejects.toMatchObject({ code: "not_found" });
    await expect(registerEvidence(b.client, b.id, savedId, { fileName: "x.png", sizeBytes: 10, contentType: "image/png" })).rejects.toMatchObject({ code: "not_found" });
    expect((await b.client.storage.from("claim-evidence").upload(`${a.id}/${savedId}/planted.png`, new Blob([PNG]), { contentType: "image/png" })).error).not.toBeNull();
    expect((await b.client.storage.from("claim-evidence").download(reg.storagePath)).data).toBeNull();

    // Removing it removes the file too.
    await deleteEvidence(a.client, a.id, savedId, reg.evidenceId);
    expect(await listEvidence(a.client, savedId)).toEqual([]);
    expect(await folder(a.id, savedId)).toEqual([]);
  }, 90_000);

  it("details can be edited (deadline dates follow), and a re-check keeps the user's progress", async () => {
    const before = (await getClaim(a.client, savedId))!;
    const ticked = before.checklist_json.filter((c) => c.done).map((c) => c.label);
    await updateClaimDetails(a.client, a.id, savedId, {
      title: "Stolen phone from the car",
      description: before.description,
      when: "2026-10-10",
      where: "vehicle",
      forced_entry: "yes",
      unattended: null,
    });
    const edited = (await getClaim(a.client, savedId))!;
    expect(edited.title).toBe("Stolen phone from the car");
    expect(edited.incident_date).toBe("2026-10-10");
    expect(edited.assessment_json.deadlines.find((d) => d.hours === 48)?.due_date).toBe("2026-10-12");
    expect(edited.assessment_json.stale).toBeFalsy(); // nothing that affects the guidance changed

    await updateClaimDetails(a.client, a.id, savedId, { title: edited.title, description: "Someone broke into my car at the station and took my phone", when: "2026-10-10", where: "vehicle", forced_entry: "yes", unattended: null });
    expect((await getClaim(a.client, savedId))!.assessment_json.stale).toBe(true);
    await recheckClaim(a.client, a.id, savedId);
    const after = (await getClaim(a.client, savedId))!;
    expect(after.assessment_json.stale).toBeFalsy();
    for (const label of ticked) expect(after.checklist_json.find((c) => c.label === label)?.done, label).toBe(true);
    await expect(updateClaimDetails(b.client, b.id, savedId, { title: "x", description: "xxx", when: "unknown", where: null })).rejects.toMatchObject({ code: "not_found" });
  }, 90_000);

  it("Ask about a claim file keeps its own conversation, and only for its owner", async () => {
    const r = await askQuestion(a.client, a.id, { question: "What excess do I pay for my laptop?", policyId: null, threadId: null, claimId: savedId });
    const { data: thread } = await a.client.from("qa_threads").select("claim_id, policy_id").eq("id", r.threadId).single();
    expect(thread).toEqual({ claim_id: savedId, policy_id: gadgetId });
    expect((await getLatestThread(a.client, gadgetId, savedId)).threadId).toBe(r.threadId);
    expect((await getLatestThread(a.client, gadgetId)).threadId).not.toBe(r.threadId);
    await expect(askQuestion(b.client, b.id, { question: "What excess do I pay?", policyId: null, threadId: null, claimId: savedId })).rejects.toMatchObject({ status: 404 });
  }, 60_000);

  it("deleting a claim file removes its evidence files from storage", async () => {
    await addFile(a, savedId, "police-report.pdf", "application/pdf", new TextEncoder().encode("%PDF-1.4\n%fictional\n"));
    expect(await folder(a.id, savedId)).toHaveLength(1);
    await deleteClaim(a.client, a.id, savedId);
    expect(await getClaim(a.client, savedId)).toBeNull();
    expect(await folder(a.id, savedId)).toEqual([]);
    expect((await admin.from("claim_evidence").select("id").eq("claim_id", savedId)).data).toEqual([]);
  }, 60_000);
});
