// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getServerSessionSnapshot,
  getServerSitemap,
  getServerSitemapIndex,
  lookupServerBingo,
} from "@/lib/api/server";

const mocks = vi.hoisted(() => ({ requestHeaders: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.requestHeaders }));

describe("server API request identity", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SSR_TRUST_PROXY_CLIENT_IP", "true");
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ user: null })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function outboundHeaders(call = 0): Headers {
    return new Headers(fetchMock.mock.calls[call]![1]?.headers);
  }

  it.each(["203.0.113.25", "2001:db8::25"])(
    "forwards one trusted ingress IP %s while preserving the caller's cookie",
    async (clientIp) => {
      mocks.requestHeaders.mockResolvedValue(
        new Headers({
          "X-Forwarded-For": clientIp,
          "X-Real-IP": "192.0.2.99",
          Forwarded: "for=192.0.2.99",
          Authorization: "Bearer ignored-incoming-token",
          Cookie: "sessionid=ignored-incoming-cookie",
        }),
      );

      await getServerSessionSnapshot("sessionid=explicit-session");

      expect(mocks.requestHeaders).toHaveBeenCalledOnce();
      expect(outboundHeaders().get("X-Forwarded-For")).toBe(clientIp);
      expect(outboundHeaders().get("Cookie")).toBe("sessionid=explicit-session");
      expect(outboundHeaders().get("Accept")).toBe("application/json");
      expect(outboundHeaders().get("X-Real-IP")).toBeNull();
      expect(outboundHeaders().get("Forwarded")).toBeNull();
      expect(outboundHeaders().get("Authorization")).toBeNull();
      expect(fetchMock.mock.calls[0]![1]?.cache).toBe("no-store");
    },
  );

  it("preserves separate request identities for otherwise identical guest lookups", async () => {
    mocks.requestHeaders
      .mockResolvedValueOnce(new Headers({ "X-Forwarded-For": "203.0.113.1" }))
      .mockResolvedValueOnce(new Headers({ "X-Forwarded-For": "203.0.113.2" }));

    await getServerSessionSnapshot();
    await getServerSessionSnapshot();

    expect(outboundHeaders(0).get("X-Forwarded-For")).toBe("203.0.113.1");
    expect(outboundHeaders(1).get("X-Forwarded-For")).toBe("203.0.113.2");
    expect(outboundHeaders(0).get("Cookie")).toBeNull();
    expect(outboundHeaders(1).get("Cookie")).toBeNull();
  });

  it("forwards trusted identity on normal public lookups and anonymous sitemap calls", async () => {
    mocks.requestHeaders.mockResolvedValue(
      new Headers({ "X-Forwarded-For": "203.0.113.25", Cookie: "sessionid=private-session" }),
    );

    await lookupServerBingo("board-id", "sessionid=explicit-session");
    await getServerSitemapIndex();
    await getServerSitemap("2");

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      expect.stringMatching(/\/bingos\/board-id\/$/),
      expect.stringMatching(/\/sitemap\/bingos\/index\/$/),
      expect.stringMatching(/\/sitemap\/bingos\/\?part=2$/),
    ]);
    expect(outboundHeaders(0).get("Cookie")).toBe("sessionid=explicit-session");
    for (const call of [1, 2]) {
      expect(outboundHeaders(call).get("Cookie")).toBeNull();
      expect(outboundHeaders(call).get("X-Forwarded-For")).toBe("203.0.113.25");
    }
  });

  it.each([
    null,
    "",
    "unknown",
    "203.0.113.25, 198.51.100.10",
    "2001:db8::25,203.0.113.25",
    "fe80::1%en0",
    "fe80::1%25en0",
    "[2001:db8::25]",
    "203.0.113.25:8080",
    "203.000.113.25",
    "127.1",
    " 203.0.113.25 ",
  ])("rejects a malformed or nonsingle ingress identity %j", async (value) => {
    // A plain getter also exercises raw values before Web Headers normalization.
    mocks.requestHeaders.mockResolvedValue({ get: () => value });
    await getServerSessionSnapshot();
    expect(outboundHeaders().get("X-Forwarded-For")).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["", "false", "TRUE", "1"])(
    "does not read or forward incoming identity when the opt-in is %j",
    async (flag) => {
      vi.stubEnv("SSR_TRUST_PROXY_CLIENT_IP", flag);
      mocks.requestHeaders.mockResolvedValue(new Headers({ "X-Forwarded-For": "203.0.113.25" }));
      await getServerSessionSnapshot("sessionid=explicit-session");
      expect(mocks.requestHeaders).not.toHaveBeenCalled();
      expect(outboundHeaders().get("X-Forwarded-For")).toBeNull();
      expect(outboundHeaders().get("Cookie")).toBe("sessionid=explicit-session");
    },
  );

  it("defaults to ignoring client-supplied identity outside the trusted ingress", async () => {
    vi.stubEnv("SSR_TRUST_PROXY_CLIENT_IP", undefined);
    await getServerSitemapIndex();
    expect(mocks.requestHeaders).not.toHaveBeenCalled();
    expect(outboundHeaders().get("X-Forwarded-For")).toBeNull();
    expect(outboundHeaders().get("Cookie")).toBeNull();
  });

  it("does not promote alternative incoming IP headers when normalized XFF is missing", async () => {
    mocks.requestHeaders.mockResolvedValue(
      new Headers({ "X-Real-IP": "203.0.113.25", Forwarded: "for=203.0.113.25" }),
    );
    await getServerSessionSnapshot();
    expect(outboundHeaders().get("X-Forwarded-For")).toBeNull();
  });
});
