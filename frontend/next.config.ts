import type { NextConfig } from "next";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Development request and console diagnostics can contain recovery tokens.
  logging: false,
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*/",
        destination: `${apiBaseUrl.replace(/\/$/, "")}/:path*/`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiBaseUrl.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      ...["/reset-password", "/verify-email", "/confirm-email-change"].map((source) => ({
        source,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      })),
    ];
  },
};

export default nextConfig;
