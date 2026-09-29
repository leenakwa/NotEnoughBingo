import { ImageResponse } from "next/og";

import { SocialPreviewCard } from "@/components/social/social-preview-card";
import { getServerShare } from "@/lib/api/server";

export const alt = "Shared bingo result preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ShareOpenGraphImage({
  params,
}: {
  params: Promise<{ bingoId: string; shareId: string }>;
}) {
  const { bingoId, shareId } = await params;
  const result = await getServerShare(bingoId, shareId);
  return new ImageResponse(
    <SocialPreviewCard
      eyebrow={result ? `Shared by ${result.owner_display_name}` : "Shared result"}
      title={result?.revision.title ?? "Result unavailable"}
      summary={
        result
          ? `${result.selected_cells.length} of ${result.revision.cells.length} cells selected.`
          : "This result is not publicly available."
      }
      revision={result?.revision}
      selected={new Set(result?.selected_cells ?? [])}
    />,
    size,
  );
}
