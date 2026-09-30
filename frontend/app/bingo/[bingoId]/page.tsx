import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { BingoPlayer } from "@/features/play/bingo-player";
import { getServerProfile, getServerSession, lookupServerBingo } from "@/lib/api/server";
import { absoluteSiteUrl, isPublicProduction, shortDescription } from "@/lib/site";

type BingoPageProps = { params: Promise<{ bingoId: string }> };

async function requestBingo(bingoId: string) {
  const cookieHeader = (await cookies()).toString();
  const lookup = await lookupServerBingo(bingoId, cookieHeader);
  if (lookup.notFound) notFound();
  return lookup.data;
}

export async function generateMetadata({ params }: BingoPageProps): Promise<Metadata> {
  const { bingoId } = await params;
  const bingo = await requestBingo(bingoId);
  const revision = bingo?.current_revision;
  if (!bingo || !revision) {
    return { title: "Bingo unavailable", robots: { index: false, follow: false } };
  }

  const author = bingo.author.display_name || `@${bingo.author.username}`;
  const description = shortDescription(
    revision.description,
    `Play ${revision.title}, a ${revision.size}×${revision.size} bingo by ${author}.`,
  );
  const canonical = absoluteSiteUrl(`/bingo/${bingo.id}`);
  const image = absoluteSiteUrl(`/bingo/${bingo.id}/opengraph-image`);
  const indexable =
    isPublicProduction() && bingo.visibility === "public" && bingo.status === "published";

  return {
    title: revision.title,
    description,
    alternates: { canonical },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      type: "website",
      title: revision.title,
      description,
      url: canonical,
      images: [{ url: image, width: 1200, height: 630, alt: `Preview of ${revision.title}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: revision.title,
      description,
      images: [image],
    },
  };
}

export default async function BingoPage({ params }: BingoPageProps) {
  const { bingoId } = await params;
  const cookieHeader = (await cookies()).toString();
  const [lookup, initialViewer] = await Promise.all([
    lookupServerBingo(bingoId, cookieHeader),
    getServerSession(cookieHeader),
  ]);
  if (lookup.notFound) notFound();
  const initialAuthorProfile =
    lookup.data &&
    initialViewer &&
    initialViewer !== "guest" &&
    initialViewer.id !== lookup.data.author.id
      ? await getServerProfile(lookup.data.author.username, cookieHeader)
      : null;
  return (
    <BingoPlayer
      bingoId={bingoId}
      initialBingo={lookup.data}
      initialViewer={initialViewer}
      initialAuthorProfile={initialAuthorProfile}
    />
  );
}
