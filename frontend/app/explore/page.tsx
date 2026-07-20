import type { Metadata } from "next";
import { Suspense } from "react";

import { ExplorePage } from "@/components/explore/explore-page";
import { LoadingState } from "@/components/ui/page-state";

export const metadata: Metadata = { title: "Explore" };

export default function ExploreRoute() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="page-shell">
          <LoadingState />
        </main>
      }
    >
      <ExplorePage />
    </Suspense>
  );
}
