import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAlternates } from "next/dist/lib/metadata/resolvers/resolve-basics";
import { resolveOpenGraph } from "next/dist/lib/metadata/resolvers/resolve-opengraph";

import { generateMetadata as bingoMetadata } from "@/app/bingo/[bingoId]/page";
import { generateMetadata as exploreMetadata } from "@/app/explore/page";
import { generateMetadata as profileMetadata } from "@/app/profile/[username]/page";
import { generateMetadata as shareMetadata } from "@/app/share/[bingoId]/[shareId]/page";
import robots from "@/app/robots";
import type { BingoDetail, SharedResult, UserProfile } from "@/lib/api/types";
import { absoluteSiteUrl, siteUrl } from "@/lib/site";
import { defaultOpenGraph } from "@/lib/metadata";

const mocks = vi.hoisted(() => ({
  getBingo: vi.fn(),
  getExplore: vi.fn(),
  getShare: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ toString: () => "" }),
}));

vi.mock("@/lib/api/server", () => ({
  getServerBingo: mocks.getBingo,
  getServerExplore: mocks.getExplore,
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
  const previousEnvironment = process.env.APP_ENVIRONMENT;
  const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_ENVIRONMENT = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://bingo.example.com";
  });

  afterEach(() => {
    if (previousEnvironment === undefined) delete process.env.APP_ENVIRONMENT;
    else process.env.APP_ENVIRONMENT = previousEnvironment;
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
  });

  it.each([
    ["discover", "Discover"],
    ["trending", "Trending"],
    ["privacy", "Privacy Policy"],
    ["terms", "Terms of Service"],
    ["community-guidelines", "Community Guidelines"],
    ["support", "Support & Moderation"],
    ["explore", "Explore"],
  ])(
    "resolves /%s Open Graph URL to its canonical with all shared defaults",
    async (route, title) => {
      const pages = {
        discover: () => import("@/app/discover/page"),
        trending: () => import("@/app/trending/page"),
        privacy: () => import("@/app/privacy/page"),
        terms: () => import("@/app/terms/page"),
        "community-guidelines": () => import("@/app/community-guidelines/page"),
        support: () => import("@/app/support/page"),
      };
      const metadata =
        route === "explore"
          ? await exploreMetadata({ searchParams: Promise.resolve({ search: "board", page: "2" }) })
          : (await pages[route as keyof typeof pages]()).metadata;
      const context = { trailingSlash: false, isStaticMetadataRouteFile: false };
      const openGraph = await resolveOpenGraph(
        metadata.openGraph,
        siteUrl(),
        Promise.resolve(`/${route}`),
        context,
        null,
      );
      const alternates = await resolveAlternates(
        metadata.alternates,
        siteUrl(),
        Promise.resolve(`/${route}`),
        context,
      );

      expect(metadata.title).toBe(title);
      expect(metadata.description).toEqual(expect.any(String));
      expect(openGraph?.url?.toString()).toBe(absoluteSiteUrl(`/${route}`));
      expect(openGraph?.url?.toString()).toBe(alternates?.canonical?.url.toString());
      expect(openGraph).toMatchObject({
        type: "website",
        siteName: "Not Enough Bingo",
        images: [
          {
            url: new URL(absoluteSiteUrl("/opengraph-image")),
            width: 1200,
            height: 630,
            alt: "Not Enough Bingo — create, play, and share community bingo boards",
          },
        ],
      });
      if (route === "explore") expect(metadata.robots).toEqual({ index: false, follow: true });
    },
  );

  it("retains the root Open Graph defaults without inventing a root URL", () => {
    expect(defaultOpenGraph()).toEqual({
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
    });
  });

  it.each([
    { label: "no parameters", searchParams: {} },
    { label: "undefined search", searchParams: { search: undefined } },
    { label: "empty search", searchParams: { search: "" } },
    { label: "whitespace search", searchParams: { search: " \t\n " } },
    { label: "empty repeated languages", searchParams: { languages: ["", " \t ", "\n"] } },
  ])("keeps base Explore metadata indexable for $label", async ({ searchParams }) => {
    const metadata = await exploreMetadata({ searchParams: Promise.resolve(searchParams) });

    expect(metadata.robots).toBeUndefined();
    expect(metadata.alternates).toEqual({ canonical: "/explore" });
    expect(metadata.openGraph).toMatchObject({ url: "/explore" });
    expect(mocks.getExplore).not.toHaveBeenCalled();
  });

  it.each([
    { label: "search", searchParams: { search: "board" } },
    { label: "author", searchParams: { author: "author" } },
    { label: "tags", searchParams: { tags: "games" } },
    { label: "languages", searchParams: { languages: "en" } },
    { label: "ordering", searchParams: { ordering: "newest" } },
    { label: "page", searchParams: { page: "2" } },
    { label: "later repeated language", searchParams: { languages: ["", "en"] } },
    { label: "later repeated search", searchParams: { search: [" \t ", " board "] } },
  ])("keeps Explore $label query state out of search", async ({ searchParams }) => {
    const metadata = await exploreMetadata({ searchParams: Promise.resolve(searchParams) });

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toEqual({ canonical: "/explore" });
    expect(metadata.openGraph).toMatchObject({ url: "/explore" });
    expect(mocks.getExplore).not.toHaveBeenCalled();
  });

  it.each([
    { label: "base Explore", searchParams: {} },
    { label: "repeated language query", searchParams: { languages: ["", "en"] } },
  ])("keeps staging $label out of crawlers", async ({ searchParams }) => {
    process.env.APP_ENVIRONMENT = "staging";
    const metadata = await exploreMetadata({ searchParams: Promise.resolve(searchParams) });

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toEqual({ canonical: "/explore" });
    expect(metadata.openGraph).toMatchObject({ url: "/explore" });
    expect(mocks.getExplore).not.toHaveBeenCalled();
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
      images: [
        {
          url: absoluteSiteUrl("/bingo/11111111-1111-4111-8111-111111111111/opengraph-image"),
          width: 1200,
          height: 630,
          alt: `Preview of ${revision.title}`,
        },
      ],
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
    expect(metadata.openGraph).toMatchObject({
      images: [
        {
          url: absoluteSiteUrl(
            "/share/11111111-1111-4111-8111-111111111111/share-token/opengraph-image",
          ),
          width: 1200,
          height: 630,
        },
      ],
    });
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

  it("keeps preview environments out of crawlers and public metadata", async () => {
    process.env.APP_ENVIRONMENT = "staging";
    mocks.getBingo.mockResolvedValue(bingo("public"));

    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    await expect(
      bingoMetadata({
        params: Promise.resolve({ bingoId: "11111111-1111-4111-8111-111111111111" }),
      }),
    ).resolves.toMatchObject({ robots: { index: false, follow: false } });
  });

  it("rejects loopback and non-deployable origins in public production", () => {
    for (const origin of ["http://localhost:3000", "https://ci.example.invalid", "not a URL"]) {
      process.env.NEXT_PUBLIC_APP_URL = origin;
      expect(() => siteUrl()).toThrow();
    }
  });
});
