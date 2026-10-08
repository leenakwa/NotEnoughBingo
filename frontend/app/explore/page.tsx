import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";

import { ExplorePage } from "@/components/explore/explore-page";
import { LoadingState } from "@/components/ui/page-state";
import { getServerExplore } from "@/lib/api/server";
import { isPublicProduction } from "@/lib/site";

type ExploreSearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: ExploreSearchParams;
}): Promise<Metadata> {
  const raw = await searchParams;
  const hasSearchState = Object.values(raw).some((value) =>
    Array.isArray(value) ? value.some((entry) => entry.trim()) : value?.trim(),
  );
  return {
    title: "Explore",
    description: "Search public bingo boards by title, author, or tag.",
    alternates: { canonical: "/explore" },
    robots: !isPublicProduction()
      ? { index: false, follow: false }
      : hasSearchState
        ? { index: false, follow: true }
        : undefined,
  };
}

export default async function ExploreRoute({
  searchParams,
}: {
  searchParams: ExploreSearchParams;
}) {
  const raw = await searchParams;
  const rawPage = Number(first(raw.page));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const ordering = first(raw.ordering) === "newest" ? ("newest" as const) : ("popular" as const);
  const cookieHeader = (await cookies()).toString();
  const initialResult = await getServerExplore(
    {
      search: first(raw.search).trim(),
      author: first(raw.author).trim(),
      tags: first(raw.tags).trim(),
      languages: Array.isArray(raw.languages)
        ? raw.languages
        : raw.languages
          ? [raw.languages]
          : [],
      ordering,
      page,
    },
    cookieHeader,
  );

  return (
    <Suspense
      fallback={
        <main id="main-content" className="page-shell">
          <LoadingState />
        </main>
      }
    >
      <ExplorePage initialResult={initialResult} />
    </Suspense>
  );
}
