import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { BingoPlayer } from "@/features/play/bingo-player";
import { lookupServerBingo } from "@/lib/api/server";
import { absoluteSiteUrl, shortDescription } from "@/lib/site";

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
  const image = revision.cover?.thumbnail_url ?? revision.cover?.url ?? undefined;
  const canonical = absoluteSiteUrl(`/bingo/${bingo.id}`);
  const indexable = bingo.visibility === "public" && bingo.status === "published";

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
      images: image ? [{ url: image, alt: `Cover for ${revision.title}` }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: revision.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function BingoPage({ params }: BingoPageProps) {
  const { bingoId } = await params;
  const cookieHeader = (await cookies()).toString();
  const lookup = await lookupServerBingo(bingoId, cookieHeader);
  if (lookup.notFound) notFound();
  return <BingoPlayer bingoId={bingoId} initialBingo={lookup.data} />;
}
