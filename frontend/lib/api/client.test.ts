import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiClientError, errorMessage, isAuthenticationRequiredError } from "@/lib/api/client";
import { AUTH_REQUIRED_EVENT } from "@/lib/auth-events";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("API error presentation", () => {
  it("surfaces the first field-level validation message", () => {
    const error = new ApiClientError(400, {
      code: "validation_error",
      message: "The request could not be processed.",
      details: {
        new_password: [{ message: "This password is too common.", code: "password_too_common" }],
      },
    });

    expect(errorMessage(error)).toBe("new password: This password is too common.");
  });

  it("keeps the safe envelope message when no field detail exists", () => {
    const error = new ApiClientError(503, {
      code: "service_unavailable",
      message: "The service is temporarily unavailable.",
    });

    expect(errorMessage(error)).toBe("The service is temporarily unavailable.");
  });

  it("turns browser network failures into an actionable message", () => {
    expect(errorMessage(new TypeError("Failed to fetch"))).toBe(
      "Unable to reach the service. Check your connection and try again.",
    );
  });

  it("stops a stalled read request and gives a retryable timeout message", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("The operation was aborted.", "AbortError")),
            );
          }),
      ),
    );

    const pending = api.auth.me();
    const rejection = expect(pending).rejects.toMatchObject({
      code: "request_timeout",
      message: "The service took too long to respond. Try again.",
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
  });

  it("warns that a timed-out write may already have completed", async () => {
    vi.useFakeTimers();
    document.cookie = "neb_csrf=test-csrf; path=/";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("The operation was aborted.", "AbortError")),
            );
          }),
      ),
    );

    const pending = api.auth.logout();
    const rejection = expect(pending).rejects.toMatchObject({
      code: "request_timeout",
      message: "The request timed out. It may have completed. Refresh before trying again.",
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
  });

  it("preserves caller cancellation instead of reporting a timeout", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("The operation was aborted.", "AbortError")),
            );
          }),
      ),
    );

    const pending = api.feeds.discover(1, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not show a parser exception when a server error has broken JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => {
          throw new SyntaxError("Unexpected token <internal payload>");
        },
      }),
    );

    await expect(api.auth.me()).rejects.toMatchObject({
      code: "invalid_response",
      message: "The service is temporarily unavailable.",
    });
  });

  it("explains a non-JSON gateway rate limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ "content-type": "text/html" }),
      }),
    );

    await expect(api.auth.me()).rejects.toMatchObject({
      message: "Too many requests. Wait a moment and try again.",
    });
  });

  it("does not expose missing-authentication API errors in the interface", () => {
    const error = new ApiClientError(403, {
      code: "not_authenticated",
      message: "Authentication credentials were not provided.",
    });

    expect(isAuthenticationRequiredError(error)).toBe(true);
    expect(errorMessage(error)).toBe("");
  });

  it("still shows authentication failures submitted from the login form", () => {
    const error = new ApiClientError(401, {
      code: "authentication_failed",
      message: "The email or password is incorrect.",
    });

    expect(isAuthenticationRequiredError(error)).toBe(false);
    expect(errorMessage(error)).toBe("The email or password is incorrect.");
  });

  it("notifies the app when a protected action finds an expired session", async () => {
    const listener = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, listener);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          error: {
            code: "not_authenticated",
            message: "Authentication credentials were not provided.",
          },
        }),
      }),
    );

    try {
      await expect(api.profiles.me()).rejects.toMatchObject({ status: 403 });
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(api.auth.me()).rejects.toMatchObject({ status: 403 });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(AUTH_REQUIRED_EVENT, listener);
    }
  });
});

describe("draft concurrency headers", () => {
  it("sends the current draft ETag as If-Match", async () => {
    document.cookie = "neb_csrf=test-csrf; path=/";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.bingos.updateDraft("bingo-id", { title: "Changed" }, 7);

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(options.headers).get("If-Match")).toBe('"draft-7"');
  });
});
