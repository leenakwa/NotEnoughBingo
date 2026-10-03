import { api } from "@/lib/api/client";
import type { MediaAsset } from "@/lib/api/types";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const transferTimeoutMs = 120_000;

const sizeLimits: Record<MediaAsset["kind"], number> = {
  cover: 8 * 1024 * 1024,
  board_background: 12 * 1024 * 1024,
  cell_image: 5 * 1024 * 1024,
  avatar: 5 * 1024 * 1024,
  export: 0,
};

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export type UploadPhase = "preparing" | "uploading" | "processing";

export interface UploadOptions {
  signal?: AbortSignal;
  onPhase?: (phase: UploadPhase) => void;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
}

function waitForProcessing(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Upload cancelled.", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Upload cancelled.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function transferToStorage(
  url: string,
  init: RequestInit,
  upstream?: AbortSignal,
): Promise<void> {
  const controller = new AbortController();
  const cancel = () => controller.abort(upstream?.reason);
  if (upstream?.aborted) cancel();
  else upstream?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, transferTimeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error("Image upload failed. Check your connection and try again.");
  } catch (error) {
    if (timedOut && !upstream?.aborted) {
      throw new Error("Image upload timed out. Check your connection and try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    upstream?.removeEventListener("abort", cancel);
  }
}

export function validateImageFile(file: File, kind: Exclude<MediaAsset["kind"], "export">): void {
  if (!allowedTypes.has(file.type)) {
    throw new UploadValidationError("Use a JPEG, PNG, WebP, or AVIF image.");
  }
  if (file.size <= 0) {
    throw new UploadValidationError("The image is empty. Choose another image.");
  }
  if (file.size > sizeLimits[kind]) {
    const megabytes = Math.floor(sizeLimits[kind] / 1024 / 1024);
    throw new UploadValidationError(`The image must be no larger than ${megabytes} MB.`);
  }
}

export async function uploadImage(
  file: File,
  kind: Exclude<MediaAsset["kind"], "export">,
  options: UploadOptions = {},
): Promise<MediaAsset> {
  validateImageFile(file, kind);
  throwIfCancelled(options.signal);
  options.onPhase?.("preparing");
  const ticket = await api.uploads.createIntent(
    {
      kind,
      file_name: file.name,
      content_type: file.type,
      size: file.size,
    },
    options.signal,
  );
  throwIfCancelled(options.signal);
  options.onPhase?.("uploading");

  if (ticket.method === "POST" && ticket.fields) {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.fields)) form.set(key, value);
    form.set("file", file);
    await transferToStorage(
      ticket.upload_url,
      {
        method: "POST",
        body: form,
      },
      options.signal,
    );
  } else if (ticket.upload_url.startsWith("/api/")) {
    await api.uploads.uploadContent(
      ticket.asset_id,
      file,
      { ...ticket.headers, "Content-Type": file.type },
      options.signal,
    );
  } else {
    await transferToStorage(
      ticket.upload_url,
      {
        method: ticket.method,
        headers: { ...ticket.headers, "Content-Type": file.type },
        body: file,
      },
      options.signal,
    );
  }

  throwIfCancelled(options.signal);
  options.onPhase?.("processing");
  let asset = await api.uploads.complete(ticket.asset_id, options.signal);
  for (let attempt = 0; attempt < 45 && asset.status !== "ready"; attempt += 1) {
    if (["rejected", "quarantined", "deleted"].includes(asset.status)) {
      throw new Error(asset.rejection_reason || "The image was rejected during validation.");
    }
    await waitForProcessing(Math.min(1_500, 400 + attempt * 100), options.signal);
    asset = await api.uploads.get(ticket.asset_id, options.signal);
  }
  throwIfCancelled(options.signal);
  if (asset.status !== "ready" || !asset.url) {
    throw new Error("Image processing is taking longer than expected. Try again shortly.");
  }
  return asset;
}
