import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { SharedResultView } from "@/features/play/shared-result-view";
import { lookupServerShare } from "@/lib/api/server";
import { absoluteSiteUrl } from "@/lib/site";

type SharePageProps = {
  params: Promise<{ bingoId: string; shareId: string }>;
};

async function requestShare(bingoId: string, shareId: string) {
  const cookieHeader = (await cookies()).toString();
  const lookup = await lookupServerShare(bingoId, shareId, cookieHeader);
  if (lookup.notFound) notFound();
  return lookup.data;
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { bingoId, shareId } = await params;
  const result = await requestShare(bingoId, shareId);
  if (!result) {
    return { title: "Shared result unavailable", robots: { index: false, follow: false } };
  }

  const title = `${result.owner_display_name}'s result — ${result.revision.title}`;
  const description = `${result.selected_cells.length} of ${result.revision.cells.length} cells selected. Open the result or play this bingo yourself.`;
  const canonical = absoluteSiteUrl(`/share/${result.bingo_id}/${result.id}`);
  const image = result.revision.cover?.thumbnail_url ?? result.revision.cover?.url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      images: image ? [{ url: image, alt: `Cover for ${result.revision.title}` }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { bingoId, shareId } = await params;
  const cookieHeader = (await cookies()).toString();
  const lookup = await lookupServerShare(bingoId, shareId, cookieHeader);
  if (lookup.notFound) notFound();
  return <SharedResultView bingoId={bingoId} shareId={shareId} initialResult={lookup.data} />;
}
