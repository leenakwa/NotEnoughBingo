import { ImageResponse } from "next/og";

import { SocialPreviewCard } from "@/components/social/social-preview-card";
import { getServerBingo } from "@/lib/api/server";

export const alt = "Bingo board preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BingoOpenGraphImage({
  params,
}: {
  params: Promise<{ bingoId: string }>;
}) {
  const { bingoId } = await params;
  const bingo = await getServerBingo(bingoId);
  const revision = bingo?.current_revision;
  const publiclyAvailable = bingo?.status === "published" && bingo.visibility !== "private";
  return new ImageResponse(
    <SocialPreviewCard
      eyebrow={publiclyAvailable ? `by @${bingo.author.username}` : "Community bingo"}
      title={publiclyAvailable && revision ? revision.title : "Bingo unavailable"}
      summary={
        publiclyAvailable && revision
          ? `${revision.size}×${revision.size} · Open the board and tap what applies to you.`
          : "This board is not publicly available."
      }
      revision={publiclyAvailable ? revision : null}
    />,
    size,
  );
}
