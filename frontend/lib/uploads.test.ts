import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaAsset } from "@/lib/api/types";
import { uploadImage, type UploadPhase, type UploadProgress } from "@/lib/uploads";

const mocks = vi.hoisted(() => ({
  createIntent: vi.fn(),
  complete: vi.fn(),
  get: vi.fn(),
  uploadContent: vi.fn(),
  transferUpload: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ api: { uploads: mocks } }));
vi.mock("@/lib/upload-transfer", () => ({ transferUpload: mocks.transferUpload }));

const asset = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "ready",
  url: "/api/v1/media/11111111-1111-4111-8111-111111111111/",
} as MediaAsset;
const image = () => new File(["image"], "image.png", { type: "image/png" });

describe("uploadImage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createIntent.mockResolvedValue({
      asset_id: asset.id,
      method: "POST",
      upload_url: "https://storage.example.test/upload",
      fields: { key: "staging/example", policy: "signed-policy" },
    });
    mocks.transferUpload.mockResolvedValue({ ok: true });
    mocks.complete.mockResolvedValue(asset);
  });

  afterEach(() => vi.useRealTimers());

  it("keeps upload bytes, HTTP acceptance, and validated readiness separate", async () => {
    vi.useFakeTimers();
    const phases: UploadPhase[] = [];
    const progress: UploadProgress[] = [];
    let finishTransfer!: (result: { ok: boolean }) => void;
    mocks.transferUpload.mockImplementation(
      () => new Promise((resolve) => (finishTransfer = resolve)),
    );
    mocks.complete.mockResolvedValue({ ...asset, status: "processing", url: null });
    mocks.get.mockResolvedValue(asset);
    const operation = uploadImage(image(), "cover", {
      onPhase: (phase) => phases.push(phase),
      onProgress: (value) => progress.push(value),
    });
    await vi.waitFor(() => expect(mocks.transferUpload).toHaveBeenCalledOnce());
    const transferOptions = mocks.transferUpload.mock.calls[0]?.[1];
    transferOptions.onProgress({ loaded: 5, total: 5 });
    expect(progress).toEqual([{ loaded: 5, total: 5 }]);
    expect(phases).toEqual(["preparing", "uploading"]);
    expect(mocks.complete).not.toHaveBeenCalled();

    finishTransfer({ ok: true });
    await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
    expect(phases).toEqual(["preparing", "uploading", "processing"]);
    expect(mocks.get).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(await operation).toBe(asset);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(asset.id, undefined);
  });

  it("preserves all signed POST fields and lets the browser set the multipart boundary", async () => {
    const file = image();
    await uploadImage(file, "cover");
    const [url, options] = mocks.transferUpload.mock.calls[0]!;
    expect(url).toBe("https://storage.example.test/upload");
    expect(options.method).toBe("POST");
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    expect([...options.body.entries()]).toEqual([
      ["key", "staging/example"],
      ["policy", "signed-policy"],
      ["file", file],
    ]);
    expect(options.withCredentials).toBeUndefined();
  });

  it("preserves signed PUT headers without adding API headers or credentials", async () => {
    mocks.createIntent.mockResolvedValue({
      asset_id: asset.id,
      method: "PUT",
      upload_url: "https://storage.example.test/signed-put",
      headers: { "content-type": "image/webp", "X-Signed-Header": "signed" },
    });
    const progress = vi.fn();
    const controller = new AbortController();
    await uploadImage(image(), "cover", { onProgress: progress, signal: controller.signal });
    expect(mocks.transferUpload).toHaveBeenCalledExactlyOnceWith(
      "https://storage.example.test/signed-put",
      {
        method: "PUT",
        body: expect.any(File),
        headers: { "content-type": "image/webp", "X-Signed-Header": "signed" },
        onProgress: progress,
        signal: controller.signal,
      },
    );
    expect(mocks.uploadContent).not.toHaveBeenCalled();
  });

  it("adds the actual file MIME type when a PUT ticket has no signed content type", async () => {
    mocks.createIntent.mockResolvedValue({
      asset_id: asset.id,
      method: "PUT",
      upload_url: "https://storage.example.test/signed-put",
      headers: { "X-Signed-Header": "signed" },
    });
    await uploadImage(image(), "cover");
    expect(mocks.transferUpload.mock.calls[0]?.[1].headers).toEqual({
      "X-Signed-Header": "signed",
      "Content-Type": "image/png",
    });
  });

  it("uses the authenticated API upload path with the same signal and byte callback", async () => {
    mocks.createIntent.mockResolvedValue({
      asset_id: asset.id,
      method: "PUT",
      upload_url: `/api/v1/uploads/${asset.id}/content/`,
      headers: { "X-Upload-Token": "ticket-token" },
    });
    const file = image();
    const progress = vi.fn();
    const controller = new AbortController();
    await uploadImage(file, "cover", { onProgress: progress, signal: controller.signal });
    expect(mocks.uploadContent).toHaveBeenCalledExactlyOnceWith(
      asset.id,
      file,
      { "X-Upload-Token": "ticket-token", "Content-Type": "image/png" },
      controller.signal,
      progress,
    );
    expect(mocks.transferUpload).not.toHaveBeenCalled();
  });

  it.each([
    [new DOMException("Timed out", "TimeoutError"), "Image upload timed out"],
    [new TypeError("Network unavailable"), "Network unavailable"],
    [new DOMException("Cannot send", "InvalidStateError"), "Cannot send"],
  ])("does not complete or attach an asset after transport failure %#", async (error, message) => {
    mocks.transferUpload.mockRejectedValue(error);
    const phases: UploadPhase[] = [];
    await expect(
      uploadImage(image(), "cover", { onPhase: (phase) => phases.push(phase) }),
    ).rejects.toThrow(message);
    expect(phases).toEqual(["preparing", "uploading"]);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("does not complete after the storage provider rejects fully transferred bytes", async () => {
    mocks.transferUpload.mockResolvedValue({ ok: false, status: 403 });
    await expect(uploadImage(image(), "cover")).rejects.toThrow(
      "Image upload failed. Check your connection and try again.",
    );
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("cancels before intent creation or completion even if the transfer just finished", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadImage(image(), "cover", { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mocks.createIntent).not.toHaveBeenCalled();

    const active = new AbortController();
    mocks.transferUpload.mockImplementation(async () => {
      active.abort();
      return { ok: true };
    });
    await expect(uploadImage(image(), "cover", { signal: active.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("stops processing polling when the caller cancels", async () => {
    mocks.complete.mockResolvedValue({ ...asset, status: "processing", url: null });
    const controller = new AbortController();
    const operation = uploadImage(image(), "cover", { signal: controller.signal });
    await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledOnce());
    controller.abort();
    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("does not return an asset rejected during processing", async () => {
    mocks.complete.mockResolvedValue({
      ...asset,
      status: "rejected",
      rejection_reason: "This file is not a valid image.",
      url: null,
    });
    await expect(uploadImage(image(), "cover")).rejects.toThrow("This file is not a valid image.");
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
