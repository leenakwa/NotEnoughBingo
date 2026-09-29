import type { Metadata } from "next";
import { cookies } from "next/headers";

import { FeedPage } from "@/components/feeds/feed-page";
import { getServerFeed } from "@/lib/api/server";

export const metadata: Metadata = {
  title: "Discover",
  description: "Discover public bingo boards, play as a guest, and share your result.",
  alternates: { canonical: "/discover" },
};

export default async function DiscoverPage() {
  const cookieHeader = (await cookies()).toString();
  const initialResult = await getServerFeed("discover", 1, cookieHeader);

  return (
    <FeedPage
      kind="discover"
      title="Discover"
      description="New work from people you follow, tags you enjoy, and useful community picks."
      initialResult={initialResult}
    />
  );
}
