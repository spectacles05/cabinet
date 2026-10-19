import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnthropic } from "@/lib/ai/client";
import { getAppMode } from "@/lib/ai/mode";
import { canFallBack, isUnavailableError, markUnavailable, shouldTryClaude } from "@/lib/ai/availability";
import { getPolicies } from "@/lib/policies";
import { RunLogger } from "@/lib/runs/logger";
import { withinAiBudget } from "@/lib/runs/rate-limit";
import { ServiceError } from "@/lib/extraction/service";
import type { RetrievedChunk } from "@/lib/qa/types";
import {
  addOnExclusionFindings,
  citedKeys,
  materialCandidates,
  missingInformationFindings,
  overlapFindings,
  renewalFindings,
} from "./checks";
import { selectMaterialWithClaude } from "./claude-audit";
import {
  AUDIT_SCHEMA_VERSION,
  type Certainty,
  type Finding,
  type FindingAction,
  type FindingEvidence,
  type InsightType,
  type Priority,
} from "./types";

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
// Time-sensitive and verification findings first, then double cover, then exclusions to be aware of.
const TYPE_ORDER: Record<InsightType, number> = { renewal_due: 0, missing_information: 1, possible_overlap: 2, exclusion: 3 };
const rank = (type: InsightType, priority: Priority | null) => TYPE_ORDER[type] * 10 + PRIORITY_ORDER[priority ?? "low"];

export type InsightRow = {
  id: string;
  insight_type: InsightType;
  title: string;
  explanation: string;
  priority: Priority | null;
  status: "open" | "reviewed" | "dismissed";
  generated_at: string;
  evidence: FindingEvidence[];
  due_date: string | null;
  model: string | null;
  action_item_id: string | null;
  certainty: Certainty;
  detail: string | null;
  action: FindingAction;
  policy_ids: string[];
  /** Set while a "remind me later" reminder for this finding is still in the future. */
  snoozed_until: string | null;
  /** A quick yes/no about the user's circumstances, asked before the finding is shown. */
  relevance_question: string | null;
  /** The user's answer: "yes" shows the finding ("no" dismisses it). */
  relevance: "yes" | "no" | null;
};

const DEFAULT_CERTAINTY: Record<InsightType, Certainty> = {
  renewal_due: "confirmed",
  exclusion: "possible",
  possible_overlap: "possible",
  missing_information: "unverified",
};

/** Findings that belong on the Review list: open, not snoozed, and not a renewal (those live in Notifications). */
export function isActiveFinding(i: InsightRow): boolean {
  return i.status === "open" && i.insight_type !== "renewal_due" && !i.snoozed_until;
}

/** What a review depends on. If none of it has changed, the saved results are still right. */
function reviewInputHash(policies: Awaited<ReturnType<typeof getPolicies>>, documentIds: string[], mode: string): string {
  const basis = JSON.stringify({
    v: AUDIT_SCHEMA_VERSION,
    mode,
    documents: [...documentIds].sort(),
    policies: policies
      .map((p) => ({ ...p, reviewed: p.reviewed ? { ...p.reviewed, confirmed_at: null } : null }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
  return createHash("sha256").update(basis).digest("hex");
}

async function lastReviewHash(supabase: SupabaseClient): Promise<string | null> {
  const { data: last } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("workflow", "audit")
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return null;
  const { data: step } = await supabase
    .from("agent_steps")
    .select("metadata")
    .eq("run_id", last.id)
    .eq("step_name", "load_confirmed_policies")
    .maybeSingle();
  return ((step?.metadata ?? {}) as { input_hash?: string }).input_hash ?? null;
}

/**
 * Runs the coverage review over the user's confirmed policies and saves cited findings.
 * Findings are keyed by a stable fingerprint: re-running updates open findings and never
 * resurrects ones the user marked reviewed or dismissed. If nothing the review depends on has
 * changed since the last successful review, the saved results are reused (no new run, no API cost).
 */
export async function runAudit(supabase: SupabaseClient, userId: string, today = new Date()) {
  const policies = await getPolicies(supabase);
  if (policies.length === 0) throw new ServiceError("no_policies", "Add and confirm a policy before running a review.", 409);

  const mode = await getAppMode();
  const { data: docs } = await supabase.from("documents").select("id").in("policy_id", policies.map((p) => p.id));
  const inputHash = reviewInputHash(policies, (docs ?? []).map((d) => d.id as string), mode);
  if ((await lastReviewHash(supabase)) === inputHash) {
    const open = (await listInsights(supabase)).filter(isActiveFinding).length;
    return { runId: null, findingCount: open, newCount: 0, unchanged: true };
  }

  // Cost/abuse control: at most one real review per 30 seconds (reusing saved results is always allowed).
  const { count: recent } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("workflow", "audit")
    .gte("started_at", new Date(Date.now() - 30_000).toISOString());
  if ((recent ?? 0) > 0) throw new ServiceError("rate_limited", "A review was just run. Please wait a moment.", 429);

  const run = await RunLogger.start(supabase, userId, "audit");
  try {
    await run.record("load_confirmed_policies", "succeeded", 0, { policy_count: policies.length, app_mode: mode, input_hash: inputHash });

    const chunks = await run.step(
      "load_policy_text",
      async () => {
        const { data, error } = await supabase
          .from("document_chunks")
          .select("id, document_id, policy_id, page_number, text")
          .in("policy_id", policies.map((p) => p.id))
          .order("page_number")
          .limit(2000);
        if (error) throw Object.assign(new Error("chunks"), { code: "db_read_failed" });
        return (data ?? []) as RetrievedChunk[];
      },
      (c) => ({ retrieved_chunk_count: c.length }),
    );

    const deterministic = await run.step(
      "deterministic_checks",
      async () => [
        ...renewalFindings(policies, today),
        ...missingInformationFindings(policies, chunks),
        ...addOnExclusionFindings(policies),
        ...overlapFindings(policies, chunks),
      ],
      (f) => ({ insight_count: f.length, schema_version: AUDIT_SCHEMA_VERSION }),
    );

    // Unusual exclusions: Claude may pick one or two from verified, already-extracted wording (usually
    // none). Without Claude, routine exclusions aren't flagged at all: Ask covers them on request.
    const candidates = materialCandidates(policies, citedKeys(deterministic));
    let material: Finding[] | null = null;
    let model: string | null = null;
    if (mode === "live" && candidates.length && shouldTryClaude() && (await withinAiBudget(supabase, run))) {
      try {
        const r = await run.step(
          "claude_material_exclusions",
          async () => {
            try {
              return await selectMaterialWithClaude(await getAnthropic(), candidates);
            } catch (err) {
              if (isUnavailableError(err)) throw Object.assign(err as Error, { code: "claude_unavailable" });
              throw err;
            }
          },
          (r) => ({ model: r.model, insight_count: r.findings.length, input_tokens: r.inputTokens, output_tokens: r.outputTokens }),
        );
        material = r.findings;
        model = r.model;
      } catch (err) {
        if (!(canFallBack() && isUnavailableError(err))) throw err;
        markUnavailable();
      }
    }
    if (!material) {
      material = await run.step("routine_exclusions_not_flagged", async () => [] as Finding[], (f) => ({
        insight_count: f.length,
        model: "rules-audit-v2",
        app_mode: mode,
      }));
      model = "rules-audit-v2";
    }

    const findings = [...deterministic, ...material].sort((a, b) => rank(a.type, a.priority) - rank(b.type, b.priority));

    const saved = await run.step(
      "save_findings",
      async () => {
        const { data: existing } = await supabase.from("insights").select("id, fingerprint, status");
        const byFp = new Map((existing ?? []).map((e) => [e.fingerprint as string, e]));
        let created = 0;
        for (const f of findings) {
          const row = {
            insight_type: f.type,
            title: f.title,
            explanation: f.explanation,
            evidence_json: {
              evidence: f.evidence,
              due_date: f.due_date,
              policy_ids: f.policy_ids,
              detail: f.detail,
              certainty: f.certainty,
              action: f.action,
              relevance_question: f.relevance_question ?? null,
            },
            priority: f.priority,
            model: material!.includes(f) ? model : "deterministic",
            schema_version: AUDIT_SCHEMA_VERSION,
            generated_at: new Date().toISOString(),
          };
          const prior = byFp.get(f.fingerprint);
          if (!prior) {
            const { error } = await supabase.from("insights").insert({ ...row, user_id: userId, fingerprint: f.fingerprint, status: "open" });
            if (error) throw Object.assign(new Error("insert"), { code: "db_insert_failed" });
            created++;
          } else if (prior.status === "open") {
            // Keep the user's answer to the quick question.
            const { data: current } = await supabase.from("insights").select("evidence_json").eq("id", prior.id).maybeSingle();
            const relevance = (current?.evidence_json as { relevance?: string } | null)?.relevance;
            await supabase
              .from("insights")
              .update(relevance ? { ...row, evidence_json: { ...row.evidence_json, relevance } } : row)
              .eq("id", prior.id);
          } // reviewed/dismissed findings are left exactly as the user set them
        }
        // Open findings this review no longer produces (the documents or policies changed) are retired.
        const current = new Set(findings.map((f) => f.fingerprint));
        const stale = (existing ?? []).filter((e) => e.status === "open" && !current.has(e.fingerprint as string)).map((e) => e.id as string);
        if (stale.length) {
          await supabase.from("action_items").delete().in("insight_id", stale);
          await supabase.from("insights").delete().in("id", stale);
        }
        return created;
      },
      (created) => ({ insight_count: findings.length, new_insight_count: created }),
    );

    await run.finish("succeeded");
    return { runId: run.runId, findingCount: findings.length, newCount: saved, unchanged: false };
  } catch (err) {
    await run.finish("failed");
    if (err instanceof ServiceError) throw err;
    throw new ServiceError("audit_failed", "The coverage review couldn't be completed. Please try again.", 502);
  }
}

/**
 * After the user adds a document to a policy: if it's the one an open "A document is missing" note was
 * waiting for (it names the same reference, e.g. "PP1"), that note is retired straight away, as a
 * re-run of the review would. Returns the retired note's id, or null if the note still applies.
 */
export async function retireSuppliedMissingNote(supabase: SupabaseClient, policyId: string): Promise<string | null> {
  const { data: note } = await supabase.from("insights").select("id").eq("fingerprint", `missing:${policyId}`).eq("status", "open").maybeSingle();
  if (!note) return null;
  const [policy] = await getPolicies(supabase, policyId);
  if (!policy) return null;
  const { data: chunks, error } = await supabase
    .from("document_chunks")
    .select("id, document_id, policy_id, page_number, text")
    .eq("policy_id", policyId)
    .limit(2000);
  if (error) throw Object.assign(new Error("chunks"), { code: "db_read_failed" });
  if (missingInformationFindings([policy], (chunks ?? []) as RetrievedChunk[]).length) return null;
  await supabase.from("action_items").delete().eq("insight_id", note.id);
  const { error: delErr } = await supabase.from("insights").delete().eq("id", note.id);
  if (delErr) throw Object.assign(new Error("delete"), { code: "db_delete_failed" });
  return note.id as string;
}

export async function listInsights(supabase: SupabaseClient): Promise<InsightRow[]> {
  const [{ data: insights }, { data: actions }] = await Promise.all([
    supabase.from("insights").select("id, insight_type, title, explanation, priority, status, generated_at, evidence_json, model"),
    supabase.from("action_items").select("id, insight_id, due_date, completed_at"),
  ]);
  const actionByInsight = new Map((actions ?? []).filter((a) => a.insight_id).map((a) => [a.insight_id as string, a.id as string]));
  const todayIso = new Date().toISOString().slice(0, 10);
  const snoozedUntil = new Map(
    (actions ?? [])
      .filter((a) => a.insight_id && !a.completed_at && a.due_date && (a.due_date as string) > todayIso)
      .map((a) => [a.insight_id as string, a.due_date as string]),
  );
  return (insights ?? [])
    .map((i) => {
      const ev = (i.evidence_json ?? {}) as {
        evidence?: FindingEvidence[];
        due_date?: string | null;
        policy_ids?: string[];
        detail?: string | null;
        certainty?: Certainty;
        action?: FindingAction;
        relevance_question?: string | null;
        relevance?: "yes" | "no";
      };
      const evidence = ev.evidence ?? [];
      const policyIds = ev.policy_ids ?? [...new Set(evidence.map((e) => e.policy_id))];
      return {
        id: i.id,
        insight_type: i.insight_type,
        title: i.title,
        explanation: i.explanation,
        // Exclusions are informational; older rows may carry "high" from an earlier version.
        priority: i.insight_type === "exclusion" && i.priority === "high" ? "medium" : i.priority,
        status: i.status,
        generated_at: i.generated_at,
        evidence,
        due_date: ev.due_date ?? null,
        model: i.model,
        action_item_id: actionByInsight.get(i.id) ?? null,
        // Findings saved before these fields existed get sensible defaults.
        certainty: ev.certainty ?? DEFAULT_CERTAINTY[i.insight_type as InsightType],
        detail: ev.detail ?? null,
        action:
          ev.action ??
          (i.insight_type === "missing_information" && policyIds[0]
            ? { kind: "add_document", policy_id: policyIds[0] }
            : i.insight_type === "possible_overlap"
              ? { kind: "compare" }
              : { kind: "ask", policy_id: policyIds[0] ?? null, question: "What should I know about this?" }),
        policy_ids: policyIds,
        snoozed_until: snoozedUntil.get(i.id) ?? null,
        relevance_question: ev.relevance_question ?? null,
        relevance: ev.relevance ?? null,
      } as InsightRow;
    })
    .sort((a, b) => rank(a.insight_type, a.priority) - rank(b.insight_type, b.priority) || b.generated_at.localeCompare(a.generated_at));
}

const ACTION_PREFIX: Record<InsightType, string> = {
  renewal_due: "Look again:",
  exclusion: "Look again:",
  possible_overlap: "Look again:",
  missing_information: "Look again:",
};

/**
 * User-approved action: "Remind me later". Saves a reminder (an action item) due in `remindInDays`;
 * the finding leaves the Review list until then and the reminder shows in Notifications when due.
 * Idempotent per finding: an existing open reminder is moved rather than duplicated.
 */
export async function createActionFromInsight(supabase: SupabaseClient, userId: string, insightId: string, remindInDays = 7) {
  const { data: insight } = await supabase.from("insights").select("id, insight_type, title, evidence_json").eq("id", insightId).maybeSingle();
  if (!insight) throw new ServiceError("not_found", "Finding not found.", 404);

  const run = await RunLogger.start(supabase, userId, "action");
  try {
    const result = await run.step(
      "user_approved_action",
      async () => {
        const { data: existing } = await supabase
          .from("action_items")
          .select("id")
          .eq("insight_id", insightId)
          .is("completed_at", null)
          .maybeSingle();
        const dueDate = new Date();
        dueDate.setUTCDate(dueDate.getUTCDate() + remindInDays);
        const due = dueDate.toISOString().slice(0, 10);
        if (existing) {
          await supabase.from("action_items").update({ due_date: due }).eq("id", existing.id);
          return { id: existing.id as string, created: false, due };
        }
        const title = `${ACTION_PREFIX[insight.insight_type as InsightType]} ${insight.title}`.slice(0, 200);
        const { data, error } = await supabase
          .from("action_items")
          .insert({ user_id: userId, insight_id: insightId, title, due_date: due })
          .select("id")
          .single();
        if (error || !data) throw Object.assign(new Error("insert"), { code: "db_insert_failed" });
        return { id: data.id as string, created: true, due };
      },
      (r) => ({ insight_id: insightId, action_item_id: r.id, insight_type: insight.insight_type }),
    );
    await run.finish("succeeded");
    return result;
  } catch (err) {
    await run.finish("failed");
    throw err instanceof ServiceError ? err : new ServiceError("action_failed", "Couldn't create the task. Please try again.", 500);
  }
}

export async function setInsightStatus(supabase: SupabaseClient, userId: string, insightId: string, status: "open" | "reviewed" | "dismissed") {
  const run = await RunLogger.start(supabase, userId, "action");
  try {
    await run.step(
      "user_updated_finding",
      async () => {
        const { data, error } = await supabase.from("insights").update({ status }).eq("id", insightId).select("id");
        if (error || !data?.length) throw Object.assign(new Error("update"), { code: "not_found" });
        if (status !== "open") {
          await supabase.from("action_items").update({ completed_at: new Date().toISOString() }).eq("insight_id", insightId).is("completed_at", null);
        }
      },
      { insight_id: insightId, insight_status: status },
    );
    await run.finish("succeeded");
  } catch {
    await run.finish("failed");
    throw new ServiceError("not_found", "Finding not found.", 404);
  }
}

/**
 * The user's answer to a finding's quick question. "No": it doesn't apply to them, so it's retired.
 * "Yes": the finding is shown. Either way it's a normal tap, logged like any other change.
 */
export async function setInsightRelevance(supabase: SupabaseClient, userId: string, insightId: string, relevant: boolean) {
  const { data: insight } = await supabase.from("insights").select("id, evidence_json").eq("id", insightId).maybeSingle();
  if (!insight) throw new ServiceError("not_found", "Finding not found.", 404);
  const run = await RunLogger.start(supabase, userId, "action");
  try {
    await run.step(
      "user_answered_question",
      async () => {
        const evidence_json = { ...(insight.evidence_json as object), relevance: relevant ? "yes" : "no" };
        const { data, error } = await supabase
          .from("insights")
          .update({ evidence_json, status: relevant ? "open" : "dismissed" })
          .eq("id", insightId)
          .select("id");
        if (error || !data?.length) throw Object.assign(new Error("update"), { code: "not_found" });
      },
      { insight_id: insightId, completed: relevant },
    );
    await run.finish("succeeded");
  } catch {
    await run.finish("failed");
    throw new ServiceError("not_found", "Finding not found.", 404);
  }
}

export async function setActionCompleted(supabase: SupabaseClient, userId: string, actionId: string, completed: boolean) {
  const run = await RunLogger.start(supabase, userId, "action");
  try {
    await run.step(
      "user_updated_task",
      async () => {
        const { data, error } = await supabase
          .from("action_items")
          .update({ completed_at: completed ? new Date().toISOString() : null })
          .eq("id", actionId)
          .select("id");
        if (error || !data?.length) throw Object.assign(new Error("update"), { code: "not_found" });
      },
      { action_item_id: actionId, completed },
    );
    await run.finish("succeeded");
  } catch {
    await run.finish("failed");
    throw new ServiceError("not_found", "Task not found.", 404);
  }
}
