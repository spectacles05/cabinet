import type { SupabaseClient } from "@supabase/supabase-js";

export type Workflow = "ingest" | "extract" | "qa" | "audit" | "action" | "claim";
export type StepStatus = "succeeded" | "failed" | "skipped" | "abstained";
export type RunStatus = "running" | "succeeded" | "failed" | "abstained";

/**
 * Only these metadata keys may be written to the execution log, and only as
 * numbers, booleans, or short identifier-like strings. Anything else is dropped.
 * This keeps policy text, names, addresses, policy numbers and Q&A text out of logs.
 */
const ALLOWED_KEYS = new Set([
  "document_id",
  "policy_id",
  "thread_id",
  "insight_id",
  "action_item_id",
  "file_sha256",
  "size_bytes",
  "page_count",
  "chunk_count",
  "citation_count",
  "rejected_citation_count",
  "retrieved_chunk_count",
  "field_count",
  "fields_found",
  "fields_missing",
  "insight_count",
  "new_insight_count",
  "policy_count",
  "document_count",
  "thread_count",
  "insight_type",
  "insight_status",
  "completed",
  "model",
  "app_mode",
  "input_hash",
  "schema_version",
  "input_tokens",
  "output_tokens",
  "assessment",
  "condition_count",
  "reply_word_count",
  "history_turn_count",
  "claim_id",
  "claim_status",
  "incident_type",
  "question_count",
  "fact_count",
  "deadline_count",
  "contact_count",
  "checklist_count",
  "dropped_count",
  "verdict",
  "budget",
  "instructions_removed",
  "denied_reason",
  "error_code",
]);

const SAFE_STRING = /^[A-Za-z0-9_.:\-]{1,80}$/;

export function redactMetadata(meta: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && SAFE_STRING.test(value)) out[key] = value;
  }
  return out;
}

export class RunLogger {
  private constructor(
    private supabase: SupabaseClient,
    public readonly runId: string,
    private userId: string,
  ) {}

  static async start(supabase: SupabaseClient, userId: string, workflow: Workflow): Promise<RunLogger> {
    const { data, error } = await supabase
      .from("agent_runs")
      .insert({ user_id: userId, workflow })
      .select("id")
      .single();
    if (error || !data) throw new Error("Could not start execution log");
    return new RunLogger(supabase, data.id, userId);
  }

  /** Re-attach to an existing run (e.g. upload started in one request, processed in another). */
  static async resume(supabase: SupabaseClient, userId: string, runId: string): Promise<RunLogger | null> {
    const { data } = await supabase.from("agent_runs").select("id").eq("id", runId).eq("user_id", userId).maybeSingle();
    return data ? new RunLogger(supabase, data.id, userId) : null;
  }

  async record(stepName: string, status: StepStatus, durationMs: number, meta?: Record<string, unknown>) {
    await this.supabase.from("agent_steps").insert({
      run_id: this.runId,
      user_id: this.userId,
      step_name: stepName,
      status,
      duration_ms: Math.max(0, Math.round(durationMs)),
      metadata: redactMetadata(meta),
    });
  }

  /**
   * Runs fn, timing it and logging success or failure. `meta` may be a function of the
   * result so counts can be logged. Errors are logged (code only) and re-thrown.
   */
  async step<T>(
    stepName: string,
    fn: () => Promise<T>,
    meta?: Record<string, unknown> | ((result: T) => Record<string, unknown>),
  ): Promise<T> {
    const t0 = performance.now();
    try {
      const result = await fn();
      await this.record(stepName, "succeeded", performance.now() - t0, typeof meta === "function" ? meta(result) : meta);
      return result;
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      await this.record(stepName, "failed", performance.now() - t0, {
        ...(typeof meta === "object" ? meta : {}),
        error_code: typeof code === "string" ? code : "error",
      });
      throw err;
    }
  }

  async finish(status: Exclude<RunStatus, "running">) {
    await this.supabase
      .from("agent_runs")
      .update({ status, completed_at: new Date().toISOString() })
      .eq("id", this.runId);
  }
}
