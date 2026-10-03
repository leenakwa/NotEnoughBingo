import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isPublicProduction } from "@/lib/site";

interface ContentSecurityPolicySources {
  imageOrigins?: readonly string[];
  connectOrigins?: readonly string[];
  mediaOrigins?: readonly string[];
}

export function parseContentSecurityPolicyOrigins(
  rawValue: string | undefined,
  isDevelopment: boolean,
): string[] {
  if (!rawValue) return [];

  const allowedProtocols = isDevelopment
    ? new Set(["http:", "https:", "ws:", "wss:"])
    : new Set(["https:", "wss:"]);
  return Array.from(
    new Set(
      rawValue
        .split(",")
        .map((candidate) => candidate.trim())
        .filter(Boolean)
        .flatMap((candidate) => {
          try {
            const url = new URL(candidate);
            return allowedProtocols.has(url.protocol) ? [url.origin] : [];
          } catch {
            return [];
          }
        }),
    ),
  );
}

function withOrigins(base: string, origins: readonly string[] | undefined): string {
  return origins?.length ? `${base} ${origins.join(" ")}` : base;
}

export function buildContentSecurityPolicy(
  nonce: string,
  isDevelopment: boolean,
  isHttps: boolean,
  sources: ContentSecurityPolicySources = {},
): string {
  const developmentHttpOrigins = isDevelopment ? ["http://localhost:*", "http://127.0.0.1:*"] : [];
  const imageOrigins = [...(sources.imageOrigins ?? []), ...developmentHttpOrigins];
  const connectOrigins = [
    ...(sources.connectOrigins ?? []),
    ...developmentHttpOrigins,
    ...(isDevelopment ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
  ];
  const mediaOrigins = [...(sources.mediaOrigins ?? []), ...developmentHttpOrigins];

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    withOrigins("img-src 'self' data: blob:", imageOrigins),
    "font-src 'self' data:",
    withOrigins("connect-src 'self'", connectOrigins),
    withOrigins("media-src 'self' blob:", mediaOrigins),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    ...(!isDevelopment && isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) {
    const canonical = new URL(request.url);
    canonical.pathname = pathname.replace(/\/+$/, "");
    return NextResponse.redirect(canonical, 308);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV !== "production";
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const isHttps = forwardedProtocol === "https" || request.nextUrl.protocol === "https:";
  const configuredMediaOrigins = parseContentSecurityPolicyOrigins(
    process.env.CSP_MEDIA_ORIGINS,
    isDevelopment,
  );
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce, isDevelopment, isHttps, {
    imageOrigins: [
      ...configuredMediaOrigins,
      ...parseContentSecurityPolicyOrigins(process.env.CSP_IMAGE_ORIGINS, isDevelopment),
    ],
    connectOrigins: [
      ...configuredMediaOrigins,
      ...parseContentSecurityPolicyOrigins(process.env.CSP_CONNECT_ORIGINS, isDevelopment),
    ],
    mediaOrigins: configuredMediaOrigins,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (!isPublicProduction()) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
