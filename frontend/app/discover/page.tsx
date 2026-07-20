import type { Metadata } from "next";

import { FeedPage } from "@/components/feeds/feed-page";

export const metadata: Metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <FeedPage
      kind="discover"
      title="Discover"
      description="New work from people you follow, tags you enjoy, and useful community picks."
    />
  );
}
