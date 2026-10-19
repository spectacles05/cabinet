import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * AI_ENGINE controls which engine reads policies and answers questions:
 *   auto   (default) use Claude; if it's unavailable (no key, no credit, auth/network/overload),
 *          fall back to the rule-based engine and record that in the run log
 *   claude Claude only (errors surface to the user)
 *   rules  rule-based engine only (no AI calls at all)
 */
export type AiMode = "auto" | "claude" | "rules";

export function aiMode(): AiMode {
  const v = (process.env.AI_ENGINE ?? "auto").toLowerCase();
  return v === "claude" || v === "rules" ? v : "auto";
}

// After Claude fails for an availability reason, skip it for a while instead of failing every request.
const COOL_OFF_MS = 10 * 60_000;
let unavailableUntil = 0;

export function shouldTryClaude(): boolean {
  const mode = aiMode();
  if (mode === "rules" || !process.env.ANTHROPIC_API_KEY) return false;
  return mode === "claude" || Date.now() >= unavailableUntil;
}

export function canFallBack(): boolean {
  return aiMode() === "auto";
}

/** True for failures that mean "Claude can't be used right now" rather than a bug in our request. */
export function isUnavailableError(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return true;
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError) return true;
  // Insufficient credit is reported as a 400 with no dedicated error class.
  if (err instanceof Anthropic.BadRequestError && /credit balance|billing/i.test(err.message)) return true;
  return false;
}

export function markUnavailable() {
  unavailableUntil = Date.now() + COOL_OFF_MS;
}
