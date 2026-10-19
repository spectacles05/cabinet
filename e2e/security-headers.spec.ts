// The production server really sends Cabinet's browser security headers, on pages and on the API.
import { expect, test } from "@playwright/test";

test("pages and API responses carry the security headers", async ({ request }) => {
  const page = await request.get("/login");
  expect(page.status()).toBe(200);
  const h = page.headers();
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["x-powered-by"]).toBeUndefined();

  // Signed out, the API refuses and the refusal is never cached.
  const api = await request.get("/api/documents");
  expect(api.status()).toBe(401);
  expect(api.headers()["cache-control"]).toContain("no-store");
  expect(api.headers()["x-frame-options"]).toBe("DENY");
});
