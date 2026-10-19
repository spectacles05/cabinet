import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: nearly every page is per-user (reads the auth cookie),
  // so the classic dynamic rendering model is simpler and safer here.
  cacheComponents: false,
  poweredByHeader: false,
  // "Reset demo" reads the fictional sample PDFs from samples/ at runtime.
  outputFileTracingIncludes: {
    "/api/demo/reset": ["./samples/*.pdf"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // Personal data must never be cached by browsers or CDNs.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
