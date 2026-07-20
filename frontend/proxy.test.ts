import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "@/proxy";

describe("Content Security Policy", () => {
  it("keeps production scripts nonce-protected and media HTTPS-only", () => {
    const policy = buildContentSecurityPolicy("test-nonce", false, true);

    expect(policy).toContain("script-src 'self' 'nonce-test-nonce'");
    expect(policy).not.toContain("strict-dynamic");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).not.toContain("http://localhost");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows the local object store and HMR only in development", () => {
    const policy = buildContentSecurityPolicy("test-nonce", true, false);

    expect(policy).toContain("img-src 'self' data: blob: https: http://localhost:*");
    expect(policy).toContain("ws://localhost:*");
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});
