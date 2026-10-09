import type { Metadata } from "next";
import { cookies } from "next/headers";

import { FeedPage } from "@/components/feeds/feed-page";
import { getServerFeed } from "@/lib/api/server";
import { defaultOpenGraph } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "Discover",
  description: "Discover public bingo boards, play as a guest, and share your result.",
  alternates: { canonical: "/discover" },
  openGraph: defaultOpenGraph("/discover"),
};

export default async function DiscoverPage() {
  const cookieHeader = (await cookies()).toString();
  const initialResult = await getServerFeed("discover", 1, cookieHeader);

  return (
    <FeedPage
      kind="discover"
      title="Discover"
      description="Fresh bingo boards from the community. Find one to play or create your own."
      initialResult={initialResult}
    />
  );
}
