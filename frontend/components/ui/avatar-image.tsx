"use client";

import { useState, type ReactNode } from "react";

export function AvatarImage({
  src,
  width,
  height,
  fallback,
  loading,
}: {
  src?: string | null;
  width: number;
  height: number;
  fallback: ReactNode;
  loading?: "eager" | "lazy";
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    // API-owned avatar URLs point to normalized raster media.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  );
}
