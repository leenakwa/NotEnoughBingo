import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateMetadata as bingoMetadata } from "@/app/bingo/[bingoId]/page";
import { generateMetadata as profileMetadata } from "@/app/profile/[username]/page";
import { generateMetadata as shareMetadata } from "@/app/share/[bingoId]/[shareId]/page";
import sitemap from "@/app/sitemap";
import type { BingoDetail, SharedResult, UserProfile } from "@/lib/api/types";
import { absoluteSiteUrl } from "@/lib/site";

const mocks = vi.hoisted(() => ({
  getBingo: vi.fn(),
  getShare: vi.fn(),
  getProfile: vi.fn(),
  getSitemap: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "" }),
}));

vi.mock("@/lib/api/server", () => ({
  getServerBingo: mocks.getBingo,
  getServerShare: mocks.getShare,
  getServerProfile: mocks.getProfile,
  lookupServerBingo: async (...args: unknown[]) => ({
    data: await mocks.getBingo(...args),
    notFound: false,
  }),
  lookupServerShare: async (...args: unknown[]) => ({
    data: await mocks.getShare(...args),
    notFound: false,
  }),
  lookupServerProfile: async (...args: unknown[]) => ({
    data: await mocks.getProfile(...args),
    notFound: false,
  }),
  getServerSitemap: mocks.getSitemap,
}));

const author = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "author",
  display_name: "Author Name",
  avatar: null,
};
const cover = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "cover" as const,
  status: "ready" as const,
  url: "https://media.example.test/cover.webp",
  thumbnail_url: "https://media.example.test/cover-thumb.webp",
  mime_type: "image/webp",
};
const revisionCells = ["one", "two"].map((id, column) => ({
  id,
  row: 0,
  column,
  text: `Cell ${column + 1}`,
  text_color: "#000000",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  background_color: "#ffffff",
  background_opacity: 1,
  image: null,
  image_alt: "",
  image_opacity: 1,
  border_color: "#000000",
  border_width: 1,
  border_style: "solid" as const,
}));
const revision = {
  id: "44444444-4444-4444-8444-444444444444",
  number: 3,
  title: "Immutable published title",
  description: "The immutable published description used by social crawlers.",
  language: "en",
  size: 3,
  board_background: null,
  cover,
  completion_style: "checkmark" as const,
  cells: revisionCells,
  published_at: "2026-08-07T00:00:00Z",
};

function bingo(visibility: BingoDetail["visibility"]): BingoDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Mutable draft title that metadata must ignore",
    description: "",
    language: "en",
    author,
    cover,
    preview: null,
    tags: [],
    size: 3,
    status: "published",
    visibility,
    completion_style: "checkmark",
    stats: { likes: 0, comments: 0, plays: 0, shares: 0, views: 0 },
    liked_by_me: false,
    published_at: revision.published_at,
    updated_at: revision.published_at,
    current_revision: revision,
    permissions: { can_edit: false, can_comment: false, can_like: false, can_report: false },
  };
}

describe("public route metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the immutable published revision and indexes only public bingos", async () => {
    mocks.getBingo.mockResolvedValue(bingo("public"));

    const metadata = await bingoMetadata({
      params: Promise.resolve({ bingoId: "11111111-1111-4111-8111-111111111111" }),
    });

    expect(metadata.title).toBe(revision.title);
    expect(metadata.description).toBe(revision.description);
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph).toMatchObject({
      title: revision.title,
      images: [{ url: cover.thumbnail_url, alt: `Cover for ${revision.title}` }],
    });

    mocks.getBingo.mockResolvedValue(bingo("unlisted"));
    await expect(
      bingoMetadata({
        params: Promise.resolve({ bingoId: "11111111-1111-4111-8111-111111111111" }),
      }),
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });
  });

  it("describes a shared result from its immutable revision and keeps it out of search", async () => {
    mocks.getShare.mockResolvedValue({
      id: "share-token",
      bingo_id: "11111111-1111-4111-8111-111111111111",
      owner_display_name: "Alex",
      owner: null,
      revision,
      selected_cells: ["one", "two"],
      created_at: revision.published_at,
    } satisfies SharedResult);

    const metadata = await shareMetadata({
      params: Promise.resolve({
        bingoId: "11111111-1111-4111-8111-111111111111",
        shareId: "share-token",
      }),
    });

    expect(metadata.title).toBe(`Alex's result — ${revision.title}`);
    expect(metadata.description).toContain("2 of 2 cells selected");
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toMatchObject({
      canonical: absoluteSiteUrl("/share/11111111-1111-4111-8111-111111111111/share-token"),
    });
  });

  it("adds canonical social metadata for a public profile", async () => {
    mocks.getProfile.mockResolvedValue({
      ...author,
      bio: "Creator of practical community bingo boards.",
      follower_count: 2,
      following_count: 1,
      is_following: false,
      privacy: {
        show_bio: true,
        show_created_bingos: true,
        show_play_history: false,
        show_shared_results: false,
        show_followers: true,
        show_following: true,
      },
    } satisfies UserProfile);

    const metadata = await profileMetadata({
      params: Promise.resolve({ username: author.username }),
    });

    expect(metadata.title).toBe("Author Name (@author)");
    expect(metadata.description).toBe("Creator of practical community bingo boards.");
    expect(metadata.alternates).toMatchObject({
      canonical: absoluteSiteUrl("/profile/author"),
    });
  });

  it("builds public bingo and deduplicated profile URLs from the lightweight index", async () => {
    mocks.getSitemap.mockResolvedValue({
      truncated: false,
      results: [
        {
          bingo_id: "11111111-1111-4111-8111-111111111111",
          author_username: "author",
          last_modified: "2026-08-07T00:00:00Z",
        },
        {
          bingo_id: "55555555-5555-4555-8555-555555555555",
          author_username: "author",
          last_modified: "2026-08-01T00:00:00Z",
        },
      ],
    });

    const result = await sitemap();

    expect(result.filter((entry) => entry.url.includes("/bingo/"))).toHaveLength(2);
    expect(result.filter((entry) => entry.url.endsWith("/profile/author"))).toHaveLength(1);
    expect(mocks.getSitemap).toHaveBeenCalledTimes(1);
  });
});
