import type { MetadataRoute } from "next";

import { getServerSitemap } from "@/lib/api/server";
import { absoluteSiteUrl } from "@/lib/site";

const staticEntries: MetadataRoute.Sitemap = [
  { url: absoluteSiteUrl("/discover"), changeFrequency: "daily", priority: 1 },
  { url: absoluteSiteUrl("/trending"), changeFrequency: "daily", priority: 0.9 },
  { url: absoluteSiteUrl("/explore"), changeFrequency: "daily", priority: 0.9 },
  { url: absoluteSiteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
  { url: absoluteSiteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
  {
    url: absoluteSiteUrl("/community-guidelines"),
    changeFrequency: "yearly",
    priority: 0.3,
  },
  { url: absoluteSiteUrl("/support"), changeFrequency: "monthly", priority: 0.3 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = [...staticEntries];
  const profileEntries = new Map<string, MetadataRoute.Sitemap[number]>();

  const catalog = await getServerSitemap();
  for (const bingo of catalog?.results ?? []) {
    entries.push({
      url: absoluteSiteUrl(`/bingo/${bingo.bingo_id}`),
      lastModified: bingo.last_modified,
      changeFrequency: "weekly",
      priority: 0.8,
    });
    if (!profileEntries.has(bingo.author_username)) {
      profileEntries.set(bingo.author_username, {
        url: absoluteSiteUrl(`/profile/${bingo.author_username}`),
        lastModified: bingo.last_modified,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  }

  entries.push(...profileEntries.values());
  return entries;
}
