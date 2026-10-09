import type { MetadataRoute } from "next";

import { absoluteSiteUrl, isPublicProduction, siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!isPublicProduction()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
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
