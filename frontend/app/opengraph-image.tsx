import { ImageResponse } from "next/og";

import { SocialPreviewCard } from "@/components/social/social-preview-card";

export const alt = "Not Enough Bingo — create, play, and share community bingo boards";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <SocialPreviewCard
      eyebrow="Community bingo"
      title="Create. Play. Share."
      summary="Pick a public board, tap what applies to you, and share an immutable result."
    />,
    size,
  );
}
