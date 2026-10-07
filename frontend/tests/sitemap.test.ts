import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/sitemap.xml/route";

const mocks = vi.hoisted(() => ({ index: vi.fn(), part: vi.fn() }));
vi.mock("@/lib/api/server", () => ({
  getServerSitemapIndex: mocks.index,
  getServerSitemap: mocks.part,
}));

const namespace = "http://www.sitemaps.org/schemas/sitemap/0.9";
const origin = "https://bingo.example.com";
const firstBoard = "11111111-1111-4111-8111-111111111111";
const secondBoard = "22222222-2222-4222-8222-222222222222";

async function document(response: Response): Promise<Document> {
  const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
  expect(xml.querySelector("parsererror")).toBeNull();
  expect(xml.documentElement.namespaceURI).toBe(namespace);
  return xml;
}

function locations(xml: Document): string[] {
  return Array.from(xml.getElementsByTagNameNS(namespace, "loc"), (node) => node.textContent!);
}

function request(query = ""): Request {
  return new Request(`https://untrusted-request.example/sitemap.xml${query}`);
}

describe("public XML sitemaps", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_ENVIRONMENT", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("publishes an ordered root index with static and occupied sparse buckets", async () => {
    mocks.index.mockResolvedValue({ parts: ["0", "2", "922337203685477"] });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const xml = await document(response);
    expect(xml.documentElement.localName).toBe("sitemapindex");
    expect(locations(xml)).toEqual([
      `${origin}/sitemap.xml?part=static`,
      `${origin}/sitemap.xml?part=0`,
      `${origin}/sitemap.xml?part=2`,
      `${origin}/sitemap.xml?part=922337203685477`,
    ]);
    expect(mocks.index).toHaveBeenCalledOnce();
    expect(mocks.part).not.toHaveBeenCalled();
  });

  it("keeps the seven static routes available without a backend lookup", async () => {
    const response = await GET(request("?part=static"));
    const xml = await document(response);
    expect(xml.documentElement.localName).toBe("urlset");
    expect(locations(xml)).toEqual(
      [
        "discover",
        "trending",
        "explore",
        "privacy",
        "terms",
        "community-guidelines",
        "support",
      ].map((path) => `${origin}/${path}`),
    );
    expect(mocks.index).not.toHaveBeenCalled();
    expect(mocks.part).not.toHaveBeenCalled();
  });

  it("returns every board in a part and one profile with its newest modification", async () => {
    const username = "writer' & <name>";
    mocks.part.mockResolvedValue({
      truncated: false,
      results: [
        { bingo_id: firstBoard, author_username: username, last_modified: "2026-08-01T00:00:00Z" },
        { bingo_id: secondBoard, author_username: username, last_modified: "2026-08-07T00:00:00Z" },
      ],
    });
    const response = await GET(request("?part=2"));
    const text = await response.clone().text();
    expect(text).toContain("&apos;");
    const xml = await document(response);
    expect(locations(xml)).toEqual([
      `${origin}/bingo/${firstBoard}`,
      `${origin}/bingo/${secondBoard}`,
      `${origin}/profile/${encodeURIComponent(username)}`,
    ]);
    expect(
      xml.getElementsByTagNameNS(namespace, "url")[2]!.querySelector("lastmod")?.textContent,
    ).toBe("2026-08-07T00:00:00.000Z");
    expect(mocks.part).toHaveBeenCalledExactlyOnceWith("2");
    expect(mocks.index).not.toHaveBeenCalled();
  });

  it("returns valid empty XML for an empty catalog or a now-empty bucket", async () => {
    mocks.index.mockResolvedValue({ parts: [] });
    expect(locations(await document(await GET(request())))).toEqual([
      `${origin}/sitemap.xml?part=static`,
    ]);
    mocks.part.mockResolvedValue({ results: [], truncated: false });
    expect(locations(await document(await GET(request("?part=999"))))).toEqual([]);
  });

  it.each([
    "",
    "00",
    "01",
    "-1",
    "+1",
    "1.0",
    "1e2",
    " 1",
    "1\n",
    "part1",
    "922337203685478",
    "9".repeat(100),
  ])("rejects noncanonical or out-of-range part %j before any backend lookup", async (part) => {
    expect((await GET(request(`?part=${encodeURIComponent(part)}`))).status).toBe(400);
    expect(mocks.index).not.toHaveBeenCalled();
    expect(mocks.part).not.toHaveBeenCalled();
  });

  it.each(["?part=0&part=1", "?page=1", "?part=0&page_size=50000"])(
    "rejects unsupported pagination controls %s",
    async (query) => {
      expect((await GET(request(query))).status).toBe(400);
      expect(mocks.index).not.toHaveBeenCalled();
      expect(mocks.part).not.toHaveBeenCalled();
    },
  );

  it.each([null, {}, { parts: ["00"] }, { parts: ["1", "0"] }, { parts: ["0", "0"] }])(
    "signals index unavailability instead of publishing partial XML for %j",
    async (index) => {
      mocks.index.mockResolvedValue(index);
      const response = await GET(request());
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("300");
      expect(await response.text()).not.toContain("<sitemapindex");
    },
  );

  it("does not silently truncate an index exceeding the protocol entry count", async () => {
    mocks.index.mockResolvedValue({
      parts: Array.from({ length: 50_000 }, (_, part) => String(part)),
    });
    expect((await GET(request())).status).toBe(503);
  });

  it.each([
    null,
    { truncated: true, results: [] },
    { truncated: false, results: [null] },
    {
      truncated: false,
      results: [{ bingo_id: firstBoard, author_username: "writer", last_modified: "invalid" }],
    },
  ])("signals bucket unavailability for incomplete or malformed payload %j", async (catalog) => {
    mocks.part.mockResolvedValue(catalog);
    const response = await GET(request("?part=0"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("300");
  });

  it("rejects a bucket over its board limit and invalid protocol URL lengths", async () => {
    mocks.part.mockResolvedValue({ truncated: false, results: new Array(10_001).fill(null) });
    expect((await GET(request("?part=0"))).status).toBe(503);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", `https://${"a".repeat(2_048)}.example.com`);
    expect((await GET(request("?part=static"))).status).toBe(503);
  });

  it("signals thrown backend failures as retryable 503s", async () => {
    mocks.index.mockRejectedValue(new Error("timeout"));
    expect((await GET(request())).status).toBe(503);
    mocks.part.mockRejectedValue(new Error("timeout"));
    expect((await GET(request("?part=0"))).status).toBe(503);
  });

  it.each(["", "?part=static", "?part=0"])(
    "serves empty nonindexing staging XML with zero backend calls for %s",
    async (query) => {
      vi.stubEnv("APP_ENVIRONMENT", "staging");
      const response = await GET(request(query));
      expect(response.status).toBe(200);
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(locations(await document(response))).toEqual([]);
      expect(mocks.index).not.toHaveBeenCalled();
      expect(mocks.part).not.toHaveBeenCalled();
    },
  );
});
