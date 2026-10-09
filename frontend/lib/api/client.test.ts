import { afterEach, describe, expect, it, vi } from "vitest";

import {
  api,
  ApiClientError,
  errorMessage,
  fieldValidationMessage,
  isAuthenticationRequiredError,
} from "@/lib/api/client";
import { AUTH_REQUIRED_EVENT, AUTH_SESSION_OBSERVED_EVENT } from "@/lib/auth-events";
import { reportBrowserError } from "@/lib/browser-errors";

vi.mock("@/lib/browser-errors", () => ({ reportBrowserError: vi.fn() }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(reportBrowserError).mockClear();
});

describe("API error presentation", () => {
  it("reports unexpected API failures without reporting validation errors", async () => {
    document.cookie = "neb_csrf=synthetic-csrf; path=/";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(api.auth.me()).rejects.toBeInstanceOf(ApiClientError);
    expect(reportBrowserError).toHaveBeenCalledWith(expect.any(ApiClientError), "api", 503);
    vi.mocked(reportBrowserError).mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 400 })));
    await expect(api.auth.me()).rejects.toBeInstanceOf(ApiClientError);
    expect(reportBrowserError).not.toHaveBeenCalled();
  });
  it("keeps CSRF bootstrap alive when analytics flushes during navigation", async () => {
    document.cookie = "neb_csrf=; Max-Age=0; path=/";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.analytics.record([]);

    expect(fetchMock.mock.calls[0]?.[0]).toContain("auth/csrf/");
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).keepalive).toBe(true);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("interactions/");
  });

  it("uses the bootstrap response token before a WebKit cookie read catches up", async () => {
    document.cookie = "neb_csrf=; Max-Age=0; path=/";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ csrf: "masked-csrf-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await Promise.all([api.auth.logout(), api.auth.logout()]);

    expect(fetchMock.mock.calls[0]?.[0]).toContain("auth/csrf/");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const headers = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Headers;
    expect(headers.get("X-CSRFToken")).toBe("masked-csrf-token");
    const secondHeaders = (fetchMock.mock.calls[2]?.[1] as RequestInit).headers as Headers;
    expect(secondHeaders.get("X-CSRFToken")).toBe("masked-csrf-token");
  });

  it("surfaces the first field-level validation message", () => {
    const error = new ApiClientError(400, {
      code: "validation_error",
      message: "The request could not be processed.",
      details: {
        new_password: [{ message: "This password is too common.", code: "password_too_common" }],
      },
    });

    expect(errorMessage(error)).toBe("new password: This password is too common.");
    expect(fieldValidationMessage(error, "new_password")).toBe("This password is too common.");
    expect(fieldValidationMessage(error, "email")).toBeNull();
  });

  it("keeps the safe envelope message when no field detail exists", () => {
    const error = new ApiClientError(503, {
      code: "service_unavailable",
      message: "The service is temporarily unavailable.",
    });

    expect(errorMessage(error)).toBe("The service is temporarily unavailable.");
  });

  it.each([
    ["cover_asset_id", "Cover image"],
    ["cover_id", "Cover image"],
    ["background_asset_id", "Background"],
    ["board_background_id", "Background"],
    ["image_asset_id", "Cell image"],
    ["avatar_id", "Avatar"],
    ["cells.image_asset_id", "Cell image"],
    ["cells.0.image_asset_id", "Cell image"],
  ])("uses the existing UI label for %s without changing inline feedback", (field, label) => {
    const error = new ApiClientError(400, {
      code: "validation_error",
      message: "The request could not be processed.",
      details: { [field]: [{ message: "Choose an available image.", code: "asset_unavailable" }] },
    });
    expect(errorMessage(error)).toBe(`${label}: Choose an available image.`);
    expect(fieldValidationMessage(error, field)).toBe("Choose an available image.");
    expect(error.code).toBe("validation_error");
  });

  it.each([
    {
      cells: [{}, { image_asset_id: [{ message: "Choose an available image.", code: "invalid" }] }],
    },
    {
      cells: {
        "2": { image_asset_id: { message: "Choose an available image.", code: "invalid" } },
      },
    },
    {
      cells: [
        {
          image_asset_id: [
            { code: "ignored_code_only" },
            { message: "Choose an available image." },
          ],
        },
      ],
    },
  ])("labels nested cell image details without exposing codes or array indices", (details) => {
    expect(
      errorMessage(
        new ApiClientError(400, { code: "validation_error", message: "Invalid input.", details }),
      ),
    ).toBe("Cell image: Choose an available image.");
  });

  it("preserves generic nested field context and ignores unknown code-only details", () => {
    const error = new ApiClientError(400, {
      code: "validation_error",
      message: "Invalid input.",
      details: {
        ignored: [{ code: "unknown_internal_code" }],
        cells: [{ text_color: [{ message: "Choose a valid color.", code: "invalid" }] }],
      },
    });
    expect(errorMessage(error)).toBe("cells · text color: Choose a valid color.");
    expect(fieldValidationMessage(error, "ignored")).toBeNull();
    expect(
      errorMessage(
        new ApiClientError(400, {
          code: "unknown_code",
          message: "Invalid input.",
          details: { cover_id: [{ code: "unknown_internal_code" }] },
        }),
      ),
    ).toBe("Invalid input.");
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

  it.each([
    new DOMException("The operation was aborted.", "AbortError"),
    new Error("The caller cancelled the request."),
  ])("preserves caller cancellation while reading the response body: %s", async (reason) => {
    const controller = new AbortController();
    let beginReading!: () => void;
    const reading = new Promise<void>((resolve) => {
      beginReading = resolve;
    });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
          beginReading();
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = api.feeds.discover(1, controller.signal);
    const rejection = expect(pending).rejects.toBe(reason);
    await reading;
    controller.abort(reason);

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it("keeps the request deadline active while reading a stalled response body", async () => {
    vi.useFakeTimers();
    let beginReading!: () => void;
    const reading = new Promise<void>((resolve) => {
      beginReading = resolve;
    });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
          beginReading();
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = api.auth.me();
    const rejection = expect(pending).rejects.toMatchObject({
      status: 0,
      code: "request_timeout",
      message: "The service took too long to respond. Try again.",
    });
    await reading;
    await vi.advanceTimersByTimeAsync(20_000);

    await rejection;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(reportBrowserError).toHaveBeenCalledExactlyOnceWith(
      expect.any(ApiClientError),
      "api",
      0,
    );
  });

  it.each([
    { status: 200, message: "The service returned an invalid response. Try again." },
    { status: 500, message: "The service is temporarily unavailable." },
  ])(
    "does not show a parser exception when a $status response has broken JSON",
    async ({ status, message }) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: status < 400,
          status,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => {
            throw new SyntaxError("Unexpected token <internal payload>");
          },
        }),
      );

      await expect(api.auth.me()).rejects.toMatchObject({
        status,
        code: "invalid_response",
        message,
      });
    },
  );

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

  it.each([
    {
      status: 429,
      code: "throttled",
      message: "Too many requests. Try again in 60 seconds.",
      details: { retry_after_seconds: 60 },
    },
    {
      status: 400,
      code: "parse_error",
      message: "The request could not be read. Refresh the page and try again.",
      details: {},
    },
  ])("preserves safe API feedback for $code", async ({ status, ...error }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ error }),
      }),
    );
    const request = api.auth.me();
    await expect(request).rejects.toMatchObject({ status, code: error.code });
    expect(errorMessage(await request.catch((caught) => caught))).toBe(error.message);
  });

  it.each([
    [400, "Please check the fields and try again."],
    [401, "Log in to continue."],
    [403, "You do not have permission to perform this action."],
    [404, "This item is unavailable or no longer exists."],
    [409, "This item changed. Refresh it before trying again."],
    [413, "The upload is too large. Choose a smaller file and try again."],
    [422, "Please check the fields and try again."],
    [500, "The service is temporarily unavailable."],
    [503, "The service is temporarily unavailable."],
  ])("presents HTTP %s gateway failures without exposing HTML", async (status, message) => {
    const readRawBody = vi.fn().mockResolvedValue("<html>internal framework detail</html>");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        headers: new Headers({ "content-type": "text/html" }),
        text: readRawBody,
      }),
    );
    await expect(api.auth.me()).rejects.toMatchObject({ status, message });
    expect(readRawBody).not.toHaveBeenCalled();
  });

  it.each([401, 403])("does not expose HTTP %s missing-authentication errors", (status) => {
    const error = new ApiClientError(status, {
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

  it.each([401, 403])(
    "notifies the app when a protected action finds an expired session with HTTP %s",
    async (status) => {
      const listener = vi.fn();
      window.addEventListener(AUTH_REQUIRED_EVENT, listener);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status,
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
        await expect(api.profiles.me()).rejects.toMatchObject({ status });
        expect(listener).toHaveBeenCalledTimes(1);
        await expect(api.auth.me()).rejects.toMatchObject({ status });
        expect(listener).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener(AUTH_REQUIRED_EVENT, listener);
      }
    },
  );
});

describe("validated child session observations", () => {
  const user = { id: "validated-account", email: "private@example.test" };
  const response = (current: typeof user | null, marker: string | null = null) =>
    new Response(JSON.stringify({ user: current, logout_event: marker }), {
      headers: { "Content-Type": "application/json" },
    });

  it.each([user, null])("shares only the validated identity and marker for %s", async (current) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(current, "validated-marker")));
    const observed = vi.fn();
    window.addEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    try {
      expect(await api.auth.session()).toEqual(current);
      expect(observed).toHaveBeenCalledOnce();
      expect(observed.mock.calls[0]?.[0].detail).toEqual({
        userId: current?.id ?? null,
        logoutEvent: "validated-marker",
      });
    } finally {
      window.removeEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    }
  });

  it("keeps explicit header marker observers separate from child bootstrap events", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(null, "validated-marker")));
    const marker = vi.fn();
    const observed = vi.fn();
    window.addEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    try {
      expect(await api.auth.session(marker)).toBeNull();
      expect(marker).toHaveBeenCalledExactlyOnceWith("validated-marker");
      expect(observed).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    }
  });

  it("ignores a late child response after a newer successful session lookup", async () => {
    let finishOld!: (value: Response) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockResolvedValueOnce(response(null, "new-marker"));
    vi.stubGlobal("fetch", fetchMock);
    const observed = vi.fn();
    window.addEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    try {
      const old = api.auth.session();
      await api.auth.session();
      finishOld(response(user, "old-marker"));
      await old;
      expect(observed).toHaveBeenCalledOnce();
      expect(observed.mock.calls[0]?.[0].detail).toEqual({
        userId: null,
        logoutEvent: "new-marker",
      });
    } finally {
      window.removeEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    }
  });

  it("does not publish an obsolete child baseline after a newer explicit header observer", async () => {
    let finishOld!: (value: Response) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockResolvedValueOnce(response(null, "new-marker"));
    vi.stubGlobal("fetch", fetchMock);
    const observed = vi.fn();
    const marker = vi.fn();
    window.addEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    try {
      const old = api.auth.session();
      await api.auth.session(marker);
      finishOld(response(user, "old-marker"));
      await old;
      expect(marker).toHaveBeenCalledExactlyOnceWith("new-marker");
      expect(observed).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    }
  });

  it("accepts an earlier successful child baseline when the newer header lookup fails", async () => {
    let finishOld!: (value: Response) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          finishOld = resolve;
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const observed = vi.fn();
    const marker = vi.fn();
    window.addEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    try {
      const old = api.auth.session();
      await expect(api.auth.session(marker)).rejects.toBeInstanceOf(ApiClientError);
      expect(observed).not.toHaveBeenCalled();
      expect(marker).not.toHaveBeenCalled();
      finishOld(response(user, "validated-marker"));
      await old;
      expect(observed).toHaveBeenCalledOnce();
      expect(observed.mock.calls[0]?.[0].detail).toEqual({
        userId: user.id,
        logoutEvent: "validated-marker",
      });
    } finally {
      window.removeEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    }
  });

  it("ignores an aborted request without suppressing an earlier successful child baseline", async () => {
    let finishOld!: (value: Response) => void;
    let finishAborted!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(
          new Promise<Response>((resolve) => {
            finishOld = resolve;
          }),
        )
        .mockReturnValueOnce(
          new Promise<Response>((resolve) => {
            finishAborted = resolve;
          }),
        ),
    );
    const controller = new AbortController();
    const observed = vi.fn();
    window.addEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
    try {
      const old = api.auth.session();
      const pending = api.auth.session(undefined, controller.signal);
      controller.abort();
      finishAborted(response(user, "discarded-marker"));
      await pending;
      expect(observed).not.toHaveBeenCalled();
      finishOld(response(user, "valid-marker"));
      await old;
      expect(observed).toHaveBeenCalledOnce();
      expect(observed.mock.calls[0]?.[0].detail).toEqual({
        userId: user.id,
        logoutEvent: "valid-marker",
      });
    } finally {
      window.removeEventListener(AUTH_SESSION_OBSERVED_EVENT, observed);
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

describe("authenticated API upload transport", () => {
  class UploadRequest extends EventTarget {
    static instances: UploadRequest[] = [];
    upload = new EventTarget();
    status = 200;
    responseText = '{"id":"upload-id","status":"uploaded"}';
    withCredentials = false;
    timeout = 0;
    open = vi.fn();
    send = vi.fn();
    abort = vi.fn(() => this.dispatchEvent(new Event("abort")));
    setRequestHeader = vi.fn();
    getAllResponseHeaders = vi.fn(() => "content-type: application/json\r\n");

    constructor() {
      super();
      UploadRequest.instances.push(this);
    }
  }

  const file = () => new File(["image"], "image.png", { type: "image/png" });
  const setup = () => {
    document.cookie = "neb_csrf=upload-csrf; path=/";
    UploadRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", UploadRequest);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  const waitForRequest = async () => {
    await vi.waitFor(() => expect(UploadRequest.instances).toHaveLength(1));
    return UploadRequest.instances[0]!;
  };

  it("bootstraps CSRF with fetch then uploads bytes with credentials and the masked token", async () => {
    const fetchMock = setup();
    document.cookie = "neb_csrf=; Max-Age=0; path=/";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ csrf: "masked-upload-token" }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const progress = vi.fn();
    const image = file();
    const operation = api.uploads.uploadContent(
      "upload-id",
      image,
      { "Content-Type": "image/png", "X-Upload-Token": "signed-token" },
      undefined,
      progress,
    );
    const xhr = await waitForRequest();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("auth/csrf/");
    expect(xhr.open).toHaveBeenCalledExactlyOnceWith("PUT", "/api/v1/uploads/upload-id/content/");
    expect(xhr.send).toHaveBeenCalledExactlyOnceWith(image);
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.setRequestHeader.mock.calls).toEqual([
      ["accept", "application/json"],
      ["content-type", "image/png"],
      ["x-csrftoken", "masked-upload-token"],
      ["x-upload-token", "signed-token"],
    ]);
    xhr.upload.dispatchEvent(
      new ProgressEvent("progress", { loaded: 2, total: 5, lengthComputable: true }),
    );
    expect(progress).toHaveBeenCalledExactlyOnceWith({ loaded: 2, total: 5 });
    xhr.dispatchEvent(new Event("load"));
    expect(await operation).toEqual({ id: "upload-id", status: "uploaded" });
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it("preserves field validation details and the request ID from upload errors", async () => {
    setup();
    const operation = api.uploads.uploadContent("upload-id", file(), {});
    const xhr = await waitForRequest();
    xhr.status = 400;
    xhr.responseText = JSON.stringify({
      error: {
        code: "validation_error",
        message: "Check this image.",
        details: { file: ["This file is not an image."] },
        request_id: "upload-request-id",
      },
    });
    xhr.dispatchEvent(new Event("load"));
    await expect(operation).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
      details: { file: ["This file is not an image."] },
      requestId: "upload-request-id",
    });
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it("keeps the common non-JSON gateway feedback without exposing the raw body", async () => {
    setup();
    const operation = api.uploads.uploadContent("upload-id", file(), {});
    const xhr = await waitForRequest();
    xhr.status = 413;
    xhr.responseText = "<html>Internal upload server details</html>";
    xhr.getAllResponseHeaders.mockReturnValue("content-type: text/html\r\n");
    xhr.dispatchEvent(new Event("load"));
    await expect(operation).rejects.toMatchObject({
      status: 413,
      message: "The upload is too large. Choose a smaller file and try again.",
    });
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it("reports invalid JSON from an upload response using the common safe error", async () => {
    setup();
    const operation = api.uploads.uploadContent("upload-id", file(), {});
    const xhr = await waitForRequest();
    xhr.status = 500;
    xhr.responseText = "<internal parser payload>";
    xhr.dispatchEvent(new Event("load"));
    await expect(operation).rejects.toMatchObject({
      status: 500,
      code: "invalid_response",
      message: "The service is temporarily unavailable.",
    });
    expect(reportBrowserError).toHaveBeenCalledExactlyOnceWith(
      expect.any(ApiClientError),
      "api",
      500,
    );
  });

  it("notifies authentication loss when an API upload finds an expired session", async () => {
    setup();
    const listener = vi.fn();
    window.addEventListener(AUTH_REQUIRED_EVENT, listener);
    try {
      const operation = api.uploads.uploadContent("upload-id", file(), {});
      const xhr = await waitForRequest();
      xhr.status = 403;
      xhr.responseText = JSON.stringify({
        error: {
          code: "not_authenticated",
          message: "Authentication credentials were not provided.",
        },
      });
      xhr.dispatchEvent(new Event("load"));
      await expect(operation).rejects.toMatchObject({ status: 403, code: "not_authenticated" });
      expect(listener).toHaveBeenCalledOnce();
      expect(reportBrowserError).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(AUTH_REQUIRED_EVENT, listener);
    }
  });

  it("reports an API upload network failure while preserving the network error type", async () => {
    setup();
    const operation = api.uploads.uploadContent("upload-id", file(), {});
    const xhr = await waitForRequest();
    xhr.dispatchEvent(new Event("error"));
    await expect(operation).rejects.toBeInstanceOf(TypeError);
    expect(reportBrowserError).toHaveBeenCalledExactlyOnceWith(expect.any(TypeError), "api", 0);
  });

  it("uses the existing 120-second write deadline and cancels the native request", async () => {
    vi.useFakeTimers();
    setup();
    const operation = api.uploads.uploadContent("upload-id", file(), {});
    const rejection = expect(operation).rejects.toMatchObject({
      code: "request_timeout",
      message: "The request timed out. It may have completed. Refresh before trying again.",
    });
    const xhr = await waitForRequest();
    await vi.advanceTimersByTimeAsync(119_000);
    expect(xhr.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(xhr.abort).toHaveBeenCalledOnce();
    expect(reportBrowserError).toHaveBeenCalledExactlyOnceWith(
      expect.any(ApiClientError),
      "api",
      0,
    );
  });

  it("preserves caller cancellation without recording an upload error", async () => {
    setup();
    const controller = new AbortController();
    const progress = vi.fn();
    const operation = api.uploads.uploadContent(
      "upload-id",
      file(),
      {},
      controller.signal,
      progress,
    );
    const xhr = await waitForRequest();
    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr.abort).toHaveBeenCalledOnce();
    xhr.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 5 }));
    expect(progress).not.toHaveBeenCalled();
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it("never opens the upload transport for a pre-cancelled request", async () => {
    setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.uploads.uploadContent("upload-id", file(), {}, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(UploadRequest.instances).toHaveLength(0);
    expect(reportBrowserError).not.toHaveBeenCalled();
  });
});
