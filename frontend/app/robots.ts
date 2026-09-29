import type { MetadataRoute } from "next";

import { absoluteSiteUrl, siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/bingo/", "/profile/"],
      disallow: [
        "/api/",
        "/admin/",
        "/create",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/notifications",
      ],
    },
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: siteUrl().origin,
  };
}
