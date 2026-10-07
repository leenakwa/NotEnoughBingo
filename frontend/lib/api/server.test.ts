// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getServerSession, getServerSessionSnapshot } from "@/lib/api/server";
import type { AuthenticatedUser } from "@/lib/api/types";

vi.mock("server-only", () => ({}));

const user: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "player",
  display_name: "Test Player",
  avatar: null,
  email: "player@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};

describe("server session bootstrap", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("SSR_TRUST_PROXY_CLIENT_IP", "false");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("preserves the authenticated identity and logout marker from one private lookup", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ user, logout_event: "validated-logout-marker" })),
    );

    expect(await getServerSessionSnapshot("sessionid=synthetic-session")).toEqual({
      user,
      logout_event: "validated-logout-marker",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/auth\/session\/$/);
    expect(options?.cache).toBe("no-store");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(options?.headers).get("Cookie")).toBe("sessionid=synthetic-session");
  });

  it("distinguishes a confirmed guest baseline from an unavailable lookup", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ user: null, logout_event: "historical-logout-marker" })),
    );
    expect(await getServerSessionSnapshot()).toEqual({
      user: null,
      logout_event: "historical-logout-marker",
    });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await getServerSessionSnapshot()).toBeNull();
  });

  it("leaves the baseline unavailable when the service cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    expect(await getServerSessionSnapshot()).toBeNull();
  });

  it("normalizes an omitted logout marker for an older backend response", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ user })));
    expect(await getServerSessionSnapshot()).toEqual({ user, logout_event: null });
  });

  it.each([
    [200, user, user],
    [200, null, "guest"],
    [503, null, null],
  ] as const)(
    "keeps the existing viewer contract for status %s and user %s",
    async (status, current, expected) => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ user: current, logout_event: null }), { status }),
      );
      expect(await getServerSession()).toEqual(expected);
    },
  );
});
