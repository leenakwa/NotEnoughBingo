// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { projectPreviewPage } from "@/lib/api/preview-page";
import { getServerExplore, getServerFeed, lookupServerBingo } from "@/lib/api/server";
import type { BingoSummary, Page } from "@/lib/api/types";

vi.mock("server-only", () => ({}));

const image = {
  id: "image-id",
  url: "/media/cell.png",
  thumbnail_url: "/media/cell-thumb.png",
  width: 300,
  height: 200,
};
const cell = {
  id: "cell-id",
  row: 1,
  column: 0,
  text: "Preview text",
  text_color: "#123456",
  bold: true,
  italic: false,
  underline: true,
  strikethrough: false,
  background_color: "#abcdef",
  background_opacity: 0.6,
  image,
  image_alt: "Preview image",
  image_opacity: 0.8,
  border_color: "#456789",
  border_width: 3,
  border_style: "dashed" as const,
  font_size: 18,
  position: 2,
  image_asset_id: "image-id",
};
const bingo = {
  id: "bingo-id",
  title: "Board title",
  description: "Board description",
  language: "en",
  author: { id: "author-id", username: "player", display_name: "Player", avatar: null },
  cover: null,
  preview: { size: 2, board_background: image, cells: [cell, { ...cell, id: "next-cell" }] },
  tags: [{ id: "tag-id", name: "Tag", slug: "tag", usage_count: 8 }],
  size: 2,
  status: "published",
  visibility: "public",
  completion_style: "checkmark",
  stats: { likes: 1, comments: 2, plays: 3, shares: 4, views: 5 },
  liked_by_me: true,
  published_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
} satisfies BingoSummary;
const page = {
  count: 25,
  next: "/api/v1/feeds/discover/?page=3",
  previous: "/api/v1/feeds/discover/?page=1",
  results: [bingo, { ...bingo, id: "no-preview", preview: null }],
  response_metadata: "preserved",
} satisfies Page<BingoSummary> & { response_metadata: string };

describe("server preview projection", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("SSR_TRUST_PROXY_CLIENT_IP", "false");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function expectProjected(result: Page<BingoSummary> | null) {
    const previewCell = {
      id: "cell-id",
      row: 1,
      column: 0,
      text: "Preview text",
      text_color: "#123456",
      bold: true,
      italic: false,
      underline: true,
      strikethrough: false,
      background_color: "#abcdef",
      background_opacity: 0.6,
      image,
      image_alt: "Preview image",
      image_opacity: 0.8,
      border_color: "#456789",
      border_width: 3,
      border_style: "dashed",
      font_size: 18,
    };
    expect(result).toEqual({
      ...page,
      results: [
        {
          ...bingo,
          preview: {
            ...bingo.preview,
            cells: [previewCell, { ...previewCell, id: "next-cell" }],
          },
        },
        page.results[1],
      ],
    });
  }

  it("removes only inherited unused cell fields without mutating source data", () => {
    const source = structuredClone(page);
    const before = structuredClone(source);
    for (const entry of source.results[0]!.preview!.cells) Object.freeze(entry);

    const result = projectPreviewPage(source);

    expectProjected(result);
    expect(source).toEqual(before);
    expect(result!.results[0]!.preview!.cells[0]).not.toBe(source.results[0]!.preview!.cells[0]);
    expect(projectPreviewPage(null)).toBeNull();
    expect(projectPreviewPage({ ...page, results: [] })).toEqual({ ...page, results: [] });
  });

  it.each(["discover", "trending", "explore"] as const)(
    "projects %s results while preserving request identity and pagination",
    async (kind) => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(page)));

      const result =
        kind === "explore"
          ? await getServerExplore(
              {
                search: "board",
                author: "player",
                tags: "first, second",
                languages: ["en", "ru"],
                ordering: "newest",
                page: 2,
              },
              "sessionid=synthetic-session",
            )
          : await getServerFeed(kind, 2, "sessionid=synthetic-session");

      expectProjected(result);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0]!;
      const request = new URL(String(url));
      expect(request.pathname).toMatch(
        kind === "explore" ? /\/bingos\/$/ : new RegExp(`/feeds/${kind}/$`),
      );
      expect([...request.searchParams]).toEqual(
        kind === "explore"
          ? [
              ["search", "board"],
              ["author", "player"],
              ["tags", "first"],
              ["tags", "second"],
              ["languages", "en"],
              ["languages", "ru"],
              ["ordering", "newest"],
              ["page", "2"],
            ]
          : [["page", "2"]],
      );
      expect(options?.cache).toBe("no-store");
      expect(options?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(options?.headers).get("Cookie")).toBe("sessionid=synthetic-session");
    },
  );

  it.each(["feed", "explore"] as const)("keeps %s unavailable responses as null", async (kind) => {
    const lookup = () => (kind === "feed" ? getServerFeed("discover", 1) : getServerExplore({}));
    for (const status of [404, 503]) {
      fetchMock.mockResolvedValueOnce(new Response(null, { status }));
      expect(await lookup()).toBeNull();
    }
    fetchMock.mockRejectedValueOnce(new TypeError("Network unavailable"));
    expect(await lookup()).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("invalid JSON"));
    expect(await lookup()).toBeNull();
  });

  it("leaves inherited cell fields intact on detail lookups", async () => {
    const detail = { id: bingo.id, current_revision: { cells: [cell] } };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(detail)));
    expect(await lookupServerBingo(bingo.id)).toEqual({ data: detail, notFound: false });
  });
});
