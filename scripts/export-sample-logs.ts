// Produces a genuine, sanitised execution-log sample for the submission: a throwaway test account
// runs the main workflows in Demo Mode (no AI cost) against the real database, including one
// refused cross-account request; its own log is exported; the account is then deleted.
// Ids are replaced with short labels for readability. Usage: npm run evidence:logs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resetDemoWallet } from "@/lib/demo/reset";
import { askQuestion } from "@/lib/qa/service";
import { runAudit } from "@/lib/audit/service";
import { checkClaim, saveClaim, startClaim } from "@/lib/claims/service";
import { getPolicies } from "@/lib/policies";
import { errorResponse } from "@/lib/http";
import { ServiceError } from "@/lib/extraction/service";

config({ path: ".env.local", quiet: true });
process.env.CABINET_MODE = "demo";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const email = `evidence-${Date.now()}@example.test`;
  const password = `Ev-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error;
  const userId = data.user.id;
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  try {
    await resetDemoWallet(client, userId);
    await askQuestion(client, userId, { question: "Am I covered if I ski off-piste without a guide?", policyId: null, threadId: null });
    await runAudit(client, userId);
    const description = "Someone smashed my car window yesterday and stole my phone";
    const { triage } = await startClaim(client, userId, { description, policyId: null });
    const draft = { description, policyId: triage.policy_id!, incident_type: triage.incident_type, item: triage.item, title: triage.title, answers: { ...triage.prefilled, police: "no" as const, evidence: ["receipt"] } };
    const { assessment } = await checkClaim(client, userId, draft);
    await saveClaim(client, userId, { ...draft, assessment, confirmed: true });
    // A refused request, as the API layer records it.
    await errorResponse(new ServiceError("not_found", "That claim wasn't found.", 404), "x", { supabase: client, userId, workflow: "action" });
    void (await getPolicies(client));

    const { data: runs } = await client.from("agent_runs").select("id, workflow, status, started_at, completed_at").order("started_at");
    const { data: steps } = await client
      .from("agent_steps")
      .select("run_id, step_name, status, duration_ms, metadata, created_at")
      .in("run_id", (runs ?? []).map((r) => r.id))
      .order("created_at");

    // Readable labels instead of raw ids (the ids themselves are random UUIDs, safe to log).
    const labels = new Map<string, string>();
    const counters: Record<string, number> = {};
    const label = (id: string, kind: string) => {
      if (!labels.has(id)) labels.set(id, `${kind}-${(counters[kind] = (counters[kind] ?? 0) + 1)}`);
      return labels.get(id)!;
    };
    const relabel = (meta: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(meta).map(([k, v]) => [k, typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? label(v, k.replace(/_id$/, "")) : k === "file_sha256" ? `${String(v).slice(0, 12)}…` : v]),
      );
    const out = {
      note: "Genuine execution log of a throwaway test account (fictional sample policies, Demo Mode), exported from Supabase. Metadata is allowlisted at write time; ids relabelled for readability; the account was deleted afterwards.",
      exported_at: new Date().toISOString(),
      runs: (runs ?? []).map((r) => ({
        run: label(r.id, "run"),
        workflow: r.workflow,
        status: r.status,
        started_at: r.started_at,
        completed_at: r.completed_at,
        steps: (steps ?? [])
          .filter((s) => s.run_id === r.id)
          .map((s) => ({ step: s.step_name, status: s.status, ms: s.duration_ms, metadata: relabel(s.metadata as Record<string, unknown>) })),
      })),
    };
    const dir = join("submission", "evidence");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "execution-log-sample.json"), JSON.stringify(out, null, 2));
    // The sample must not contain the user's words or identifiers.
    const text = JSON.stringify(out);
    for (const leak of [description, "smashed", email, userId, "off-piste"]) if (text.includes(leak)) throw new Error(`leak: ${leak.slice(0, 12)}`);
    console.log(`Wrote ${out.runs.length} runs, ${(steps ?? []).length} steps to ${dir}/execution-log-sample.json (no leaks found)`);
  } finally {
    const { data: files } = await admin.storage.from("policy-pdfs").list(userId);
    if (files?.length) await admin.storage.from("policy-pdfs").remove(files.map((f) => `${userId}/${f.name}`));
    await admin.auth.admin.deleteUser(userId);
  }
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
