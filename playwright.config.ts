import { defineConfig } from "@playwright/test";
import { ANTHROPIC_TRAP_PORT } from "./tests/helpers/anthropic-trap";

// End-to-end test of the judging demo, in Demo Mode (free, deterministic). It builds and starts a
// production server on port 3100 whose Anthropic SDK is pointed at a local trap server: the test
// fails if a single request is sent to the Anthropic API. Set E2E_BASE_URL to use a running server.
const port = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL,
    channel: "msedge", // uses the Microsoft Edge already installed on Windows (no browser download)
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
        // Show the test server's own output, so a failure on the server side can be diagnosed.
        stdout: "pipe",
        stderr: "pipe",
        env: { CABINET_MODE: "demo", ANTHROPIC_BASE_URL: `http://127.0.0.1:${ANTHROPIC_TRAP_PORT}` },
      },
});
