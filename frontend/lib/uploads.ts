import { api } from "@/lib/api/client";
import type { MediaAsset } from "@/lib/api/types";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

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

export function validateImageFile(file: File, kind: Exclude<MediaAsset["kind"], "export">): void {
  if (!allowedTypes.has(file.type)) {
    throw new UploadValidationError("Use a JPEG, PNG, WebP, or AVIF image.");
  }
  if (file.size <= 0 || file.size > sizeLimits[kind]) {
    const megabytes = Math.floor(sizeLimits[kind] / 1024 / 1024);
    throw new UploadValidationError(`The image must be no larger than ${megabytes} MB.`);
  }
}

export async function uploadImage(
  file: File,
  kind: Exclude<MediaAsset["kind"], "export">,
): Promise<MediaAsset> {
  validateImageFile(file, kind);
  const ticket = await api.uploads.createIntent({
    kind,
    file_name: file.name,
    content_type: file.type,
    size: file.size,
  });

  if (ticket.method === "POST" && ticket.fields) {
    const form = new FormData();
    for (const [key, value] of Object.entries(ticket.fields)) form.set(key, value);
    form.set("file", file);
    const response = await fetch(ticket.upload_url, { method: "POST", body: form });
    if (!response.ok) throw new Error("The object storage upload failed.");
  } else if (ticket.upload_url.startsWith("/api/")) {
    await api.uploads.uploadContent(ticket.asset_id, file, {
      ...ticket.headers,
      "Content-Type": file.type,
    });
  } else {
    const response = await fetch(ticket.upload_url, {
      method: ticket.method,
      headers: { ...ticket.headers, "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("The object storage upload failed.");
  }

  let asset = await api.uploads.complete(ticket.asset_id);
  for (let attempt = 0; attempt < 45 && asset.status !== "ready"; attempt += 1) {
    if (["rejected", "quarantined", "deleted"].includes(asset.status)) {
      throw new Error(asset.rejection_reason || "The image was rejected during validation.");
    }
    await new Promise((resolve) =>
      window.setTimeout(resolve, Math.min(1_500, 400 + attempt * 100)),
    );
    asset = await api.uploads.get(ticket.asset_id);
  }
  if (asset.status !== "ready" || !asset.url) {
    throw new Error("Image processing is taking longer than expected. Try again shortly.");
  }
  return asset;
}
