import type { Metadata } from "next";

import { absoluteSiteUrl } from "@/lib/site";

export function defaultOpenGraph(url?: string): NonNullable<Metadata["openGraph"]> {
  return {
    type: "website",
    siteName: "Not Enough Bingo",
    images: [
      {
        url: absoluteSiteUrl("/opengraph-image"),
        width: 1200,
        height: 630,
        alt: "Not Enough Bingo — create, play, and share community bingo boards",
      },
    ],
    ...(url ? { url } : {}),
  };
}
