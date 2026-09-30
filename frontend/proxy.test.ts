import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { buildContentSecurityPolicy, parseContentSecurityPolicyOrigins, proxy } from "@/proxy";

describe("Content Security Policy", () => {
  it("keeps production scripts nonce-protected and media HTTPS-only", () => {
    const policy = buildContentSecurityPolicy("test-nonce", false, true);

    expect(policy).toContain("script-src 'self' 'nonce-test-nonce'");
    expect(policy).not.toContain("strict-dynamic");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(policy).not.toContain("http://localhost");
    expect(policy).not.toMatch(/(?:img|connect|media)-src[^;]*\shttps:/);
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("allows only explicit normalized production origins", () => {
    const origins = parseContentSecurityPolicyOrigins(
      "https://media.example.test/path, javascript:alert(1), http://unsafe.example.test",
      false,
    );
    const policy = buildContentSecurityPolicy("test-nonce", false, true, {
      imageOrigins: origins,
      connectOrigins: origins,
    });

    expect(origins).toEqual(["https://media.example.test"]);
    expect(policy).toContain("img-src 'self' data: blob: https://media.example.test");
    expect(policy).toContain("connect-src 'self' https://media.example.test");
    expect(policy).not.toContain("javascript:");
    expect(policy).not.toContain("http://unsafe.example.test");
  });

  it("allows the local object store and HMR only in development", () => {
    const policy = buildContentSecurityPolicy("test-nonce", true, false);

    expect(policy).toContain("img-src 'self' data: blob: http://localhost:*");
    expect(policy).toContain("ws://localhost:*");
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});

describe("canonical page URLs", () => {
  it("redirects trailing slashes while preserving search parameters", () => {
    const response = proxy(
      new NextRequest("https://bingo.example.test/discover/?languages=en&page=2"),
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://bingo.example.test/discover?languages=en&page=2",
    );
  });
});
