import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  document.cookie = "neb_csrf=synthetic-csrf; path=/";
  document.head.innerHTML = '<script src="/_next/static/chunks/app-abc.js"></script>';
  window.history.replaceState({}, "", "/create?private-marker#private-marker");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser diagnostics", () => {
  it("sends only chunk positions and enums, omitting error content and foreign URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { reportBrowserError } = await import("@/lib/browser-errors");
    const error = new TypeError("private-marker");
    error.stack = `TypeError: private-marker\n at fn (${window.location.origin}/_next/static/chunks/app-abc.js?private-marker:14:8)\n at foreign (https://foreign.test/private-marker.js:1:1)\n at fn (${window.location.origin}/bingo/private-marker:3:2)`;
    reportBrowserError(error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/v1/client-errors/");
    expect(options.credentials).toBe("same-origin");
    expect(JSON.parse(options.body)).toEqual({
      kind: "exception",
      error_type: "TypeError",
      surface: "create",
      frames: [{ filename: "/_next/static/chunks/app-abc.js", lineno: 14, colno: 8 }],
    });
    expect(options.body).not.toContain("private-marker");
  });

  it("uses the bootstrap response token and does not transmit arbitrary rejection objects", async () => {
    document.cookie = "neb_csrf=; Max-Age=0; path=/";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrf: "synthetic-masked-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { reportBrowserError } = await import("@/lib/browser-errors");
    reportBrowserError({ message: "private-marker", password: "private-marker" }, "rejection");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]![1].headers["X-CSRFToken"]).toBe("synthetic-masked-token");
    expect(fetchMock.mock.calls[1]![1].body).not.toContain("private-marker");
  });

  it("deduplicates errors and bounds reports to five per minute", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const { reportBrowserError } = await import("@/lib/browser-errors");
    const error = new Error("private-marker");
    reportBrowserError(error);
    reportBrowserError(error);
    reportBrowserError(new Error("different private content"));
    for (let status = 500; status < 510; status++) reportBrowserError(null, "api", status);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("silently stops a stalled collector without retries or recursive reporting", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { reportBrowserError } = await import("@/lib/browser-errors");
    reportBrowserError(new Error("private-marker"));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
