import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { transferUpload } from "@/lib/upload-transfer";

class FakeRequest extends EventTarget {
  static instances: FakeRequest[] = [];
  upload = new EventTarget();
  status = 200;
  responseText = '{"ready":true}';
  withCredentials = false;
  timeout = 0;
  open = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => this.dispatchEvent(new Event("abort")));
  setRequestHeader = vi.fn();
  getAllResponseHeaders = vi.fn(
    () => "content-type: application/json\r\nx-request-id: example\r\n",
  );

  constructor() {
    super();
    FakeRequest.instances.push(this);
  }
}

const blob = new Blob(["image"], { type: "image/png" });

describe("upload transfer", () => {
  beforeEach(() => {
    FakeRequest.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports known and unknown byte totals without resolving at 100 percent", async () => {
    const progress = vi.fn();
    const resolved = vi.fn();
    const operation = transferUpload("https://storage.example.test/object", {
      method: "PUT",
      body: blob,
      onProgress: progress,
    });
    void operation.then(resolved);
    const xhr = FakeRequest.instances[0]!;
    xhr.upload.dispatchEvent(
      new ProgressEvent("progress", { loaded: 2, total: 5, lengthComputable: true }),
    );
    xhr.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 4 }));
    xhr.upload.dispatchEvent(
      new ProgressEvent("progress", { loaded: 5, total: 5, lengthComputable: true }),
    );
    await Promise.resolve();

    expect(progress.mock.calls.map(([value]) => value)).toEqual([
      { loaded: 2, total: 5 },
      { loaded: 4, total: null },
      { loaded: 5, total: 5 },
    ]);
    expect(resolved).not.toHaveBeenCalled();
    expect(xhr.timeout).toBe(120_000);
    expect(xhr.withCredentials).toBe(false);

    xhr.dispatchEvent(new Event("load"));
    const response = await operation;
    expect(response).toMatchObject({ ok: true, status: 200 });
    expect(response.headers.get("X-Request-Id")).toBe("example");
    expect(await response.json()).toEqual({ ready: true });
    xhr.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 100 }));
    expect(progress).toHaveBeenCalledTimes(3);
  });

  it("registers upload progress before open and sends signed fields without multipart headers", async () => {
    const register = vi.spyOn(EventTarget.prototype, "addEventListener");
    const form = new FormData();
    form.set("key", "signed-key");
    form.set("file", blob, "image.png");
    const operation = transferUpload("https://storage.example.test/upload", {
      method: "POST",
      body: form,
    });
    const xhr = FakeRequest.instances[0]!;
    const progressIndex = register.mock.calls.findIndex(([event]) => event === "progress");
    expect(register.mock.invocationCallOrder[progressIndex]).toBeLessThan(
      xhr.open.mock.invocationCallOrder[0]!,
    );
    expect(xhr.setRequestHeader).not.toHaveBeenCalled();
    expect(xhr.send).toHaveBeenCalledExactlyOnceWith(form);
    xhr.dispatchEvent(new Event("load"));
    await operation;
  });

  it("preserves signed headers and credentials only when explicitly requested", async () => {
    const operation = transferUpload("/api/v1/uploads/example/content/", {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": "image/png", "X-Signed-Header": "signed" },
      withCredentials: true,
      timeoutMs: 0,
    });
    const xhr = FakeRequest.instances[0]!;
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.timeout).toBe(0);
    expect(xhr.setRequestHeader.mock.calls).toEqual([
      ["content-type", "image/png"],
      ["x-signed-header", "signed"],
    ]);
    xhr.dispatchEvent(new Event("load"));
    await operation;
  });

  it.each([201, 204, 205, 299, 400, 403, 500])(
    "returns HTTP %s for the caller's common error handling",
    async (status) => {
      const operation = transferUpload("/upload", { method: "PUT", body: blob });
      const xhr = FakeRequest.instances[0]!;
      xhr.status = status;
      xhr.dispatchEvent(new Event("load"));
      expect(await operation).toMatchObject({ status, ok: status < 300 });
    },
  );

  it.each([
    ["error", "TypeError"],
    ["abort", "AbortError"],
    ["timeout", "TimeoutError"],
  ])("rejects %s once and cleans up every listener", async (event, name) => {
    const controller = new AbortController();
    const removeSignal = vi.spyOn(controller.signal, "removeEventListener");
    const progress = vi.fn();
    const operation = transferUpload("/upload", {
      method: "PUT",
      body: blob,
      signal: controller.signal,
      onProgress: progress,
    });
    const xhr = FakeRequest.instances[0]!;
    const removeUpload = vi.spyOn(xhr.upload, "removeEventListener");
    const removeRequest = vi.spyOn(xhr, "removeEventListener");
    xhr.dispatchEvent(new Event(event));

    await expect(operation).rejects.toMatchObject({ name });
    expect(removeSignal).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(removeUpload).toHaveBeenCalledWith("progress", expect.any(Function));
    expect(removeRequest).toHaveBeenCalledTimes(4);
    for (const type of ["load", "error", "abort", "timeout"]) {
      expect(removeRequest).toHaveBeenCalledWith(type, expect.any(Function));
    }
    xhr.dispatchEvent(new Event("load"));
    xhr.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 5 }));
    controller.abort();
    expect(progress).not.toHaveBeenCalled();
    expect(xhr.abort).not.toHaveBeenCalled();
  });

  it("does not create a request for an already cancelled signal", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      transferUpload("/upload", { method: "PUT", body: blob, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeRequest.instances).toHaveLength(0);
  });

  it("bridges cancellation to the active transfer and ignores late progress", async () => {
    const controller = new AbortController();
    const progress = vi.fn();
    const operation = transferUpload("/upload", {
      method: "PUT",
      body: blob,
      signal: controller.signal,
      onProgress: progress,
    });
    const xhr = FakeRequest.instances[0]!;
    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(xhr.abort).toHaveBeenCalledOnce();
    xhr.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 5 }));
    expect(progress).not.toHaveBeenCalled();
  });

  it("does not send when cancellation happens during open", async () => {
    const controller = new AbortController();
    class CancelDuringOpen extends FakeRequest {
      override open = vi.fn(() => controller.abort());
    }
    vi.stubGlobal("XMLHttpRequest", CancelDuringOpen);
    const operation = transferUpload("/upload", {
      method: "PUT",
      body: blob,
      signal: controller.signal,
    });
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    const xhr = FakeRequest.instances[0]!;
    expect(xhr.send).not.toHaveBeenCalled();
    expect(xhr.abort).toHaveBeenCalledOnce();
  });

  it.each(["open", "setRequestHeader", "send"])(
    "cleans up synchronous %s failures",
    async (step) => {
      const error = new DOMException("Cannot start upload.", "InvalidStateError");
      class BrokenRequest extends FakeRequest {
        constructor() {
          super();
          this[step as "open" | "send" | "setRequestHeader"].mockImplementation(() => {
            throw error;
          });
        }
      }
      vi.stubGlobal("XMLHttpRequest", BrokenRequest);
      const controller = new AbortController();
      const removeSignal = vi.spyOn(controller.signal, "removeEventListener");
      const progress = vi.fn();
      await expect(
        transferUpload("/upload", {
          method: "PUT",
          body: blob,
          headers: { "Content-Type": "image/png" },
          signal: controller.signal,
          onProgress: progress,
        }),
      ).rejects.toBe(error);
      expect(removeSignal).toHaveBeenCalledWith("abort", expect.any(Function));
      const xhr = FakeRequest.instances[0]!;
      xhr.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 5 }));
      controller.abort();
      expect(xhr.abort).not.toHaveBeenCalled();
      expect(progress).not.toHaveBeenCalled();
    },
  );

  it("treats an HTTP load event with status zero as a network failure", async () => {
    const operation = transferUpload("/upload", { method: "PUT", body: blob });
    const xhr = FakeRequest.instances[0]!;
    xhr.status = 0;
    xhr.dispatchEvent(new Event("load"));
    await expect(operation).rejects.toBeInstanceOf(TypeError);
  });

  it("rejects and cancels the transfer if a progress observer throws", async () => {
    const error = new Error("Progress observer failed");
    const progress = vi.fn(() => {
      throw error;
    });
    const operation = transferUpload("/upload", {
      method: "PUT",
      body: blob,
      onProgress: progress,
    });
    const xhr = FakeRequest.instances[0]!;
    xhr.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 1 }));
    await expect(operation).rejects.toBe(error);
    expect(xhr.abort).toHaveBeenCalledOnce();
    xhr.upload.dispatchEvent(new ProgressEvent("progress", { loaded: 5 }));
    expect(progress).toHaveBeenCalledOnce();
  });
});
