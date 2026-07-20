import type { Metadata } from "next";

import { FeedPage } from "@/components/feeds/feed-page";

export const metadata: Metadata = { title: "Trending" };

export default function TrendingPage() {
  return (
    <FeedPage
      kind="trending"
      title="Trending"
      description="Boards gaining meaningful attention across plays, likes, comments, and shares."
    />
  );
}
