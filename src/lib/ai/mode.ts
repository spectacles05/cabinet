import "server-only";
import { cookies } from "next/headers";

/**
 * Demo Mode never sends anything to the Anthropic API: policies are read from prepared readings of
 * the fictional samples (or by the free rule-based reader), questions get prepared answers, and
 * reviews use the rule-based checks. Live AI Mode uses Claude.
 *
 * CABINET_MODE (server environment) decides who chooses:
 *   demo        always Demo Mode. The default when unset, so no deployment spends credits by accident.
 *   live        always Live AI Mode.
 *   switchable  each signed-in browser chooses with the switch in the account menu (starts in Demo).
 */
export type AppMode = "demo" | "live";
export type ModeSetting = "demo" | "live" | "switchable";

export const MODE_COOKIE = "cabinet_mode";

export function modeSetting(): ModeSetting {
  const v = (process.env.CABINET_MODE ?? "").trim().toLowerCase();
  return v === "live" || v === "switchable" ? v : "demo";
}

/** The mode for the current request. Outside a request (scripts, tests) a switchable setting means Demo. */
export async function getAppMode(): Promise<AppMode> {
  const setting = modeSetting();
  if (setting !== "switchable") return setting;
  try {
    return (await cookies()).get(MODE_COOKIE)?.value === "live" ? "live" : "demo";
  } catch {
    return "demo";
  }
}

export class DemoModeError extends Error {
  code = "demo_mode";
  constructor() {
    super("Demo Mode is on, so Cabinet doesn't send anything to the Anthropic API.");
  }
}
