import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MediaAsset } from "@/lib/api/types";
import { uploadImage, type UploadPhase } from "@/lib/uploads";

const mocks = vi.hoisted(() => ({
  createIntent: vi.fn(),
  complete: vi.fn(),
  get: vi.fn(),
  uploadContent: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({ api: { uploads: mocks } }));

const asset = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "ready",
  url: "/api/v1/media/11111111-1111-4111-8111-111111111111/",
} as MediaAsset;

describe("uploadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createIntent.mockResolvedValue({
      asset_id: asset.id,
      method: "POST",
      upload_url: "https://storage.example.test/upload",
      fields: { key: "staging/example" },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reports preparation, transfer, and processing before the ready image", async () => {
    const phases: UploadPhase[] = [];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mocks.complete.mockResolvedValue(asset);

    const result = await uploadImage(
      new File(["image"], "image.png", { type: "image/png" }),
      "cover",
      {
        onPhase: (phase) => phases.push(phase),
      },
    );

    expect(result).toBe(asset);
    expect(phases).toEqual(["preparing", "uploading", "processing"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.example.test/upload",
      expect.objectContaining({ method: "POST", signal: undefined }),
    );
  });

  it("aborts the transfer without completing or attaching the asset", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const operation = uploadImage(
      new File(["image"], "image.png", { type: "image/png" }),
      "cover",
      {
        signal: controller.signal,
      },
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
