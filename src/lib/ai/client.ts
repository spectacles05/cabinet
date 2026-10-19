import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { DemoModeError, getAppMode } from "./mode";

/** Single model for extraction, Q&A and audit. Recorded alongside every AI output. */
export const MODEL = "claude-opus-5-5";

/**
 * Server-side refusal fallback: if a safety classifier declines a request, the API re-runs it
 * on Anthropic's recommended fallback model for that refusal category within the same call.
 */
export const FALLBACK_OPTIONS: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | null = null;

/**
 * The only way to reach the Anthropic API. In Demo Mode it refuses before a client exists, so no
 * request can be sent whatever the calling code does (enforced server-side; see tests/demo-mode.test.ts).
 */
export async function getAnthropic(): Promise<Anthropic> {
  if ((await getAppMode()) !== "live") throw new DemoModeError();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example).");
  }
  // Server-only: the key never reaches the browser. 2 retries on 429/5xx by default.
  client ??= new Anthropic({ timeout: 240_000 });
  return client;
}
