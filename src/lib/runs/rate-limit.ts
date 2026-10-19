import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canFallBack } from "@/lib/ai/availability";
import { ServiceError } from "@/lib/extraction/service";
import type { RunLogger, Workflow } from "./logger";

/**
 * Per-user throttle based on the user's own execution log (RLS-scoped), so it works on serverless
 * without extra infrastructure. Returns true if the user may start another run of this workflow.
 */
export async function withinLimit(supabase: SupabaseClient, workflow: Workflow, windowSeconds: number, max: number): Promise<boolean> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { count, error } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("workflow", workflow)
    .gte("started_at", since);
  if (error) return false; // fail closed
  return (count ?? 0) < max;
}

export const LIMITS = {
  ingest: { windowSeconds: 3600, max: 20 }, // uploads per hour
  extract: { windowSeconds: 600, max: 10 }, // AI extractions per 10 minutes
} as const;

/**
 * Daily AI cost control. Every Claude call is logged with its token counts, so the last 24 hours of
 * calls can be counted for this user (RLS) and across all users (a count-only database function).
 * Caps are set with AI_DAILY_CALLS_PER_USER and AI_DAILY_CALLS_TOTAL.
 */
export const AI_DAILY = {
  perUser: () => Number(process.env.AI_DAILY_CALLS_PER_USER ?? 300),
  total: () => Number(process.env.AI_DAILY_CALLS_TOTAL ?? 1500),
};

export type AiBudget = { ok: boolean; reason: "ok" | "user_daily_cap" | "total_daily_cap" | "check_failed" };

export async function aiBudget(supabase: SupabaseClient): Promise<AiBudget> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [mine, total] = await Promise.all([
    supabase.from("agent_steps").select("id", { count: "exact", head: true }).gte("created_at", since).not("metadata->>input_tokens", "is", null),
    supabase.rpc("ai_calls_last_day"),
  ]);
  if (mine.error || total.error || typeof total.data !== "number") return { ok: false, reason: "check_failed" }; // fail closed
  if ((mine.count ?? 0) >= AI_DAILY.perUser()) return { ok: false, reason: "user_daily_cap" };
  if (total.data >= AI_DAILY.total()) return { ok: false, reason: "total_daily_cap" };
  return { ok: true, reason: "ok" };
}

/**
 * Checked (and logged) before any Claude call. Over the cap, the caller quietly uses the free
 * rule-based engine instead; only when fallback is switched off (AI_ENGINE=claude) is it an error.
 */
export async function withinAiBudget(supabase: SupabaseClient, run: RunLogger): Promise<boolean> {
  const b = await run.step("ai_budget_check", () => aiBudget(supabase), (r) => ({ completed: r.ok, budget: r.reason }));
  if (!b.ok && !canFallBack()) {
    throw new ServiceError("ai_limit", "Cabinet has reached its AI limit for today. Please try again tomorrow.", 429);
  }
  return b.ok;
}
