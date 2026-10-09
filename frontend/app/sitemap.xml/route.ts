import { getServerSitemap, getServerSitemapIndex } from "@/lib/api/server";
import { absoluteSiteUrl, isPublicProduction } from "@/lib/site";

export const dynamic = "force-dynamic";

const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
const maxPart = 922337203685477n;
const maxIndexParts = 49_999;
const maxBucketBoards = 10_000;
const maxXmlBytes = 52_428_800;
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const staticEntries = [
  { path: "/discover", changeFrequency: "daily", priority: 1 },
  { path: "/trending", changeFrequency: "daily", priority: 0.9 },
  { path: "/explore", changeFrequency: "daily", priority: 0.9 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/community-guidelines", changeFrequency: "yearly", priority: 0.3 },
  { path: "/support", changeFrequency: "monthly", priority: 0.3 },
];

function canonicalPart(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    /^(?:0|[1-9][0-9]{0,14})$/.test(value) &&
    BigInt(value) <= maxPart
  );
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function location(path: string): string {
  const url = absoluteSiteUrl(path);
  if (url.length >= 2_048) throw new Error("Sitemap URL exceeds the protocol limit");
  return `<loc>${escapeXml(url)}</loc>`;
}

function xmlResponse(root: "urlset" | "sitemapindex", entries: string[]): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="${namespace}">${entries.join("")}</${root}>`;
  if (new TextEncoder().encode(xml).byteLength > maxXmlBytes) {
    throw new Error("Sitemap exceeds the protocol byte limit");
  }
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(!isPublicProduction() ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    },
  });
}

function unavailable(): Response {
  return new Response("Sitemap temporarily unavailable", {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "300" },
  });
}

export async function GET(request: Request): Promise<Response> {
  if (!isPublicProduction()) return xmlResponse("urlset", []);

  const query = new URL(request.url).searchParams;
  const part = query.get("part");
  if (
    [...query.keys()].some((key) => key !== "part") ||
    query.getAll("part").length > 1 ||
    (part !== null && part !== "static" && !canonicalPart(part))
  ) {
    return new Response("Invalid sitemap part", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    if (part === "static") {
      return xmlResponse(
        "urlset",
        staticEntries.map(
          (entry) =>
            `<url>${location(entry.path)}<changefreq>${entry.changeFrequency}</changefreq><priority>${entry.priority}</priority></url>`,
        ),
      );
    }

    if (part === null) {
      const index = await getServerSitemapIndex();
      if (!index || !Array.isArray(index.parts) || index.parts.length > maxIndexParts) {
        return unavailable();
      }
      let previous = -1n;
      const entries = [`<sitemap>${location("/sitemap.xml?part=static")}</sitemap>`];
      for (const bucket of index.parts) {
        if (!canonicalPart(bucket) || BigInt(bucket) <= previous) return unavailable();
        previous = BigInt(bucket);
        entries.push(`<sitemap>${location(`/sitemap.xml?part=${bucket}`)}</sitemap>`);
      }
      return xmlResponse("sitemapindex", entries);
    }

    const catalog = await getServerSitemap(part);
    if (
      !catalog ||
      catalog.truncated !== false ||
      !Array.isArray(catalog.results) ||
      catalog.results.length > maxBucketBoards
    ) {
      return unavailable();
    }
    const entries: string[] = [];
    const boards = new Set<string>();
    const profiles = new Map<string, string>();
    for (const bingo of catalog.results) {
      if (
        !bingo ||
        typeof bingo.bingo_id !== "string" ||
        !uuidPattern.test(bingo.bingo_id) ||
        boards.has(bingo.bingo_id) ||
        typeof bingo.author_username !== "string" ||
        !bingo.author_username ||
        typeof bingo.last_modified !== "string"
      ) {
        return unavailable();
      }
      const lastModified = new Date(bingo.last_modified).toISOString();
      boards.add(bingo.bingo_id);
      entries.push(
        `<url>${location(`/bingo/${bingo.bingo_id}`)}<lastmod>${lastModified}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      );
      const previousModified = profiles.get(bingo.author_username);
      if (!previousModified || lastModified > previousModified) {
        profiles.set(bingo.author_username, lastModified);
      }
    }
    for (const [username, lastModified] of profiles) {
      entries.push(
        `<url>${location(`/profile/${encodeURIComponent(username)}`)}<lastmod>${lastModified}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`,
      );
    }
    return xmlResponse("urlset", entries);
  } catch {
    return unavailable();
  }
}
