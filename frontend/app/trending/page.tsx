import type { Metadata } from "next";

import { FeedPage } from "@/components/feeds/feed-page";
import { getServerFeed } from "@/lib/api/server";

export const metadata: Metadata = {
  title: "Trending",
  description: "See public bingo boards getting meaningful attention right now.",
  alternates: { canonical: "/trending" },
};

export default async function TrendingPage() {
  const initialResult = await getServerFeed("trending", 1);

  return (
    <FeedPage
      kind="trending"
      title="Trending"
      description="Boards gaining meaningful attention across plays, likes, comments, and shares."
      initialResult={initialResult}
    />
  );
}
