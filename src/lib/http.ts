import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceError } from "@/lib/extraction/service";
import { RunLogger, type Workflow } from "@/lib/runs/logger";

export type AuditContext = { supabase: SupabaseClient; userId: string; workflow: Workflow };

// Refusals worth an audit record: not yours / not found, not allowed, conflicting, too large,
// rate- or cost-limited, or a change sent without the user's confirmation.
const DENIED_STATUS = new Set([403, 404, 409, 413, 429]);
const DENIED_CODE = new Set(["confirmation_required", "not_demo"]);
// Extra fields that are safe to return alongside a user-facing error.
const SAFE_EXTRAS = ["missing", "runId"] as const;

/**
 * Records a refused request in the execution log: one failed "authorise_request" step carrying only
 * the reason code (and safe ids). Logging never gets in the way of the response.
 */
export async function logDenied(ctx: AuditContext, reason: string, meta: Record<string, unknown> = {}) {
  try {
    const run = await RunLogger.start(ctx.supabase, ctx.userId, ctx.workflow);
    await run.record("authorise_request", "failed", 0, { ...meta, denied_reason: reason, error_code: reason });
    await run.finish("failed");
  } catch {
    // The refusal itself already happened; a logging failure must not change the response.
  }
}

/**
 * The one way API routes turn an error into a response. Only messages written for users
 * (ServiceError) are shown; anything else becomes the route's generic message, so internal
 * details (database errors, stack traces) never reach the browser.
 */
export async function errorResponse(err: unknown, fallback: string, ctx?: AuditContext) {
  if (err instanceof ServiceError) {
    if (ctx && (DENIED_STATUS.has(err.status) || DENIED_CODE.has(err.code))) await logDenied(ctx, err.code);
    const extras: Record<string, unknown> = {};
    for (const key of SAFE_EXTRAS) {
      const v = (err as unknown as Record<string, unknown>)[key];
      if (v !== undefined) extras[key] = v;
    }
    return NextResponse.json({ error: err.message, code: err.code, ...extras }, { status: err.status });
  }
  // Server-side only, and only the error's type: no messages that might contain personal data.
  console.error(`[api] unexpected ${err instanceof Error ? err.name : typeof err}`);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
