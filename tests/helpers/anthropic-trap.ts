// A stand-in for api.anthropic.com. Pointing ANTHROPIC_BASE_URL here means any request the Anthropic
// SDK makes lands on this local server and is counted (it always answers 400, so nothing is retried).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** Fixed port used by the end-to-end test (its server is started by Playwright before the test runs). */
export const ANTHROPIC_TRAP_PORT = 3199;

export type AnthropicTrap = { url: string; hits: () => number; close: () => Promise<void> };

export async function startAnthropicTrap(port = 0): Promise<AnthropicTrap> {
  let hits = 0;
  const server: Server = createServer((req, res) => {
    hits++;
    req.resume();
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "trap" } }));
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const { port: actual } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${actual}`,
    hits: () => hits,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** Counts fetch calls to Anthropic's real API (a second, independent tripwire). */
export function anthropicFetchCount(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter(([input]) => String(input instanceof Request ? input.url : input).includes("anthropic.com")).length;
}
