import "server-only";

import { isIP } from "node:net";

import { headers as requestHeaders } from "next/headers";
import { cache } from "react";

import type { components as ApiComponents } from "@/lib/api/schema";
import type {
  AuthenticatedUser,
  BingoDetail,
  BingoSummary,
  Page,
  SharedResult,
  UserProfile,
} from "@/lib/api/types";

const serverApiBase =
  process.env.API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000/api/v1";

interface ServerLookup<T> {
  data: T | null;
  notFound: boolean;
}

function serverUrl(path: string, query?: URLSearchParams): string {
  const url = `${serverApiBase}/${path.replace(/^\/+/, "")}`;
  return query?.size ? `${url}?${query.toString()}` : url;
}

const trustedProxyClientIp = cache(async (): Promise<string | null> => {
  // Enable only when Next.js is private and ingress overwrites X-Forwarded-For.
  if (process.env.SSR_TRUST_PROXY_CLIENT_IP !== "true") return null;
  const value = (await requestHeaders()).get("x-forwarded-for");
  if (!value || value.includes(",") || value.includes("%") || isIP(value) === 0) return null;
  return value;
});

async function serverLookup<T>(
  path: string,
  cookieHeader = "",
  query?: URLSearchParams,
): Promise<ServerLookup<T>> {
  try {
    const headers = new Headers({ Accept: "application/json" });
    if (cookieHeader) headers.set("Cookie", cookieHeader);
    const clientIp = await trustedProxyClientIp();
    if (clientIp) headers.set("X-Forwarded-For", clientIp);
    const response = await fetch(serverUrl(path, query), {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (response.status === 404) return { data: null, notFound: true };
    if (!response.ok) return { data: null, notFound: false };
    return { data: (await response.json()) as T, notFound: false };
  } catch {
    // Public pages keep their client-side retry state when the API is briefly
    // unavailable during server rendering or local frontend-only development.
    return { data: null, notFound: false };
  }
}

async function serverGet<T>(path: string, cookieHeader = "", query?: URLSearchParams) {
  return (await serverLookup<T>(path, cookieHeader, query)).data;
}

export const lookupServerBingo = cache((bingoId: string, cookieHeader = "") =>
  serverLookup<BingoDetail>(`bingos/${encodeURIComponent(bingoId)}/`, cookieHeader),
);

export const getServerBingo = cache(
  async (bingoId: string, cookieHeader = "") =>
    (await lookupServerBingo(bingoId, cookieHeader)).data,
);

export const lookupServerShare = cache((bingoId: string, shareId: string, cookieHeader = "") =>
  serverLookup<SharedResult>(
    `shares/${encodeURIComponent(bingoId)}/${encodeURIComponent(shareId)}/`,
    cookieHeader,
  ),
);

export const getServerShare = cache(
  async (bingoId: string, shareId: string, cookieHeader = "") =>
    (await lookupServerShare(bingoId, shareId, cookieHeader)).data,
);

export const lookupServerProfile = cache((username: string, cookieHeader = "") =>
  serverLookup<UserProfile>(`profiles/${encodeURIComponent(username)}/`, cookieHeader),
);

export const getServerProfile = cache(
  async (username: string, cookieHeader = "") =>
    (await lookupServerProfile(username, cookieHeader)).data,
);

interface ServerSessionSnapshot {
  user: AuthenticatedUser | null;
  logout_event: string | null;
}

export const getServerSessionSnapshot = cache(async (cookieHeader = "") => {
  const lookup = await serverLookup<ServerSessionSnapshot>("auth/session/", cookieHeader);
  if (!lookup.data) return null;
  return {
    user: lookup.data.user ?? null,
    logout_event: lookup.data.logout_event ?? null,
  };
});

export const getServerSession = cache(async (cookieHeader = "") => {
  const snapshot = await getServerSessionSnapshot(cookieHeader);
  if (!snapshot) return null;
  return snapshot.user ?? "guest";
});

export const getServerFeed = cache(
  (kind: "discover" | "trending", page: number, cookieHeader = "") => {
    const query = new URLSearchParams({ page: String(page) });
    return serverGet<Page<BingoSummary>>(`feeds/${kind}/`, cookieHeader, query);
  },
);

export interface ExploreServerQuery {
  search?: string;
  author?: string;
  tags?: string;
  languages?: string[];
  ordering?: "popular" | "newest";
  page?: number;
}

export type PublicSitemapEntry = ApiComponents["schemas"]["PublicSitemapEntry"];
export type PublicSitemapResponse = ApiComponents["schemas"]["PublicSitemap"];
export type PublicSitemapIndexResponse = ApiComponents["schemas"]["PublicSitemapIndex"];

export const getServerSitemapIndex = () =>
  serverGet<PublicSitemapIndexResponse>("sitemap/bingos/index/");

export const getServerSitemap = (part: string) =>
  serverGet<PublicSitemapResponse>("sitemap/bingos/", "", new URLSearchParams({ part }));

export const getServerExplore = cache((input: ExploreServerQuery, cookieHeader = "") => {
  const query = new URLSearchParams();
  if (input.search) query.set("search", input.search);
  if (input.author) query.set("author", input.author);
  for (const tag of input.tags
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? []) {
    query.append("tags", tag);
  }
  for (const language of input.languages ?? []) query.append("languages", language);
  if (input.ordering && input.ordering !== "popular") query.set("ordering", input.ordering);
  if (input.page && input.page > 1) query.set("page", String(input.page));
  return serverGet<Page<BingoSummary>>("bingos/", cookieHeader, query);
});
