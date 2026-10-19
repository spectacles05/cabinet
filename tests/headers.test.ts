// The browser security headers Cabinet asks Next.js to send (the end-to-end suite checks a real server sends them).
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

type Rule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<Rule[]> {
  return (await nextConfig.headers!()) as Rule[];
}

describe("security headers", () => {
  it("every page and API response gets the browser protections", async () => {
    const all = (await rules()).find((r) => r.source === "/:path*");
    const h = Object.fromEntries((all?.headers ?? []).map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Content-Security-Policy"]).toContain("base-uri 'self'");
    expect(h["Content-Security-Policy"]).toContain("form-action 'self'");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\).*payment=\(\)/);
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}; includeSubDomains/);
  });

  it("API responses are never cached", async () => {
    const api = (await rules()).find((r) => r.source === "/api/:path*");
    expect(api?.headers).toContainEqual({ key: "Cache-Control", value: "no-store" });
  });

  it("the framework doesn't advertise itself", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
