import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' }),
  );
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_authenticated", message: "Login required." } }),
    }),
  );
});

test("frontend health route responds and HTML carries the security policy", async ({ request }) => {
  const healthResponse = await request.get("/api/health");
  expect(healthResponse.ok()).toBeTruthy();
  await expect(healthResponse.json()).resolves.toMatchObject({
    status: "ok",
    service: "frontend",
  });
  expect(healthResponse.headers()["x-content-type-options"]).toBe("nosniff");

  const htmlResponse = await request.get("/discover");
  expect(htmlResponse.ok()).toBeTruthy();
  expect(htmlResponse.headers()["content-type"]).toContain("text/html");
  expect(htmlResponse.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("primary navigation uses the production route names", async ({ page }) => {
  await page.route("**/api/v1/feeds/discover/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
    }),
  );
  await page.goto("/discover");
  await expect(page.getByRole("link", { name: "Discover" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("link", { name: "Trending" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create", exact: true })).toHaveAttribute(
    "href",
    "/create",
  );
  await expect(page.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  await expect(page.getByText("For You")).toHaveCount(0);
});

test("guest creation offers signup and recovers from a session outage", async ({ page }) => {
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "unavailable", message: "Please try later." } }),
    }),
  );
  await page.goto("/create");
  await expect(page.locator("main [role='alert']")).toContainText("Please try later.");

  await page.unroute("**/api/v1/auth/session/");
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' }),
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Create your own bingo" })).toBeVisible();
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/register$/);
});

test("bingo card keeps tags with actions and handles guest likes without an API error", async ({
  page,
}) => {
  const bingoId = "11111111-1111-4111-8111-111111111111";
  const cells = Array.from({ length: 9 }, (_, index) => ({
    id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
    position: index,
    row: Math.floor(index / 3),
    column: index % 3,
    text: `Cell ${index + 1}`,
    text_color: "#000000",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    background_color: "#ffffff",
    background_opacity: 1,
    image_asset_id: null,
    image: null,
    image_alt: "",
    image_opacity: 1,
    border_color: "#000000",
    border_width: 1,
    border_style: "solid",
  }));
  await page.route("**/api/v1/feeds/discover/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: bingoId,
            title: "Feedback board",
            description: "",
            author: {
              id: "22222222-2222-4222-8222-222222222222",
              username: "author",
              display_name: "Author",
              avatar: null,
            },
            cover: null,
            preview: { size: 3, board_background: null, cells },
            tags: [{ id: "44444444-4444-4444-8444-444444444444", name: "Design", slug: "design" }],
            size: 3,
            status: "published",
            visibility: "public",
            completion_style: "checkmark",
            stats: { likes: 4, comments: 2, plays: 0, shares: 0, views: 0 },
            liked_by_me: false,
            published_at: "2026-07-20T00:00:00Z",
            updated_at: "2026-07-20T00:00:00Z",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route(`**/api/v1/bingos/${bingoId}/likes/`, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "not_authenticated",
          message: "Authentication credentials were not provided.",
        },
      }),
    }),
  );

  await page.goto("/discover");
  await expect(
    page.getByRole("img", { name: "Preview of Feedback board, 3 by 3 bingo" }),
  ).toBeVisible();
  const card = page.locator(".bingo-card");
  await expect(card).toHaveCount(1);
  const alignment = await card.evaluate((element) => {
    const preview = element.querySelector<HTMLElement>(".bingo-card-preview");
    const tags = element.querySelector<HTMLElement>(".bingo-card__tags");
    const actions = element.querySelector<HTMLElement>(".bingo-card__actions");
    if (!preview || !tags || !actions) return null;
    const previewBox = preview.getBoundingClientRect();
    const tagsBox = tags.getBoundingClientRect();
    const actionsBox = actions.getBoundingClientRect();
    return {
      adjacent: actions.previousElementSibling === tags,
      actionsGap: Math.abs(actionsBox.top - tagsBox.bottom),
      previewGap: Math.abs(tagsBox.top - previewBox.bottom),
      previewWidth: previewBox.width,
      fontSize: Number.parseFloat(
        getComputedStyle(preview.querySelector<HTMLElement>(".bingo-card-preview__text")!).fontSize,
      ),
      textFits: Array.from(
        preview.querySelectorAll<HTMLElement>(".bingo-card-preview__text"),
      ).every(
        (text) =>
          text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= text.clientHeight + 1,
      ),
    };
  });
  expect(alignment).not.toBeNull();
  expect(alignment?.adjacent).toBe(true);
  expect(alignment?.actionsGap).toBeLessThanOrEqual(1);
  expect(alignment?.previewGap).toBeLessThanOrEqual(1);
  expect(alignment?.fontSize).toBeCloseTo((24 * (alignment?.previewWidth ?? 0)) / 760, 1);
  expect(alignment?.textFits).toBe(true);

  await page.getByRole("button", { name: "Like Feedback board" }).click();
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`/bingo/${bingoId}`)}`);
  await expect(page.getByText("Authentication credentials were not provided.")).toHaveCount(0);
});

test("authenticated header keeps notification and profile actions", async ({ page }) => {
  await page.unroute("**/api/v1/auth/session/");
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          username: "author",
          display_name: "Author",
          avatar: null,
          email: "author@example.test",
          email_verified: true,
          deletion_scheduled_for: null,
        },
      }),
    }),
  );
  await page.route("**/api/v1/feeds/discover/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
    }),
  );

  await page.goto("/discover");
  await expect(page.getByRole("link", { name: "Notifications" })).toHaveAttribute(
    "href",
    "/notifications",
  );
  await expect(page.getByRole("link", { name: "Profile for Author" })).toHaveAttribute(
    "href",
    "/profile",
  );
});

test("explore exposes title, author, tag, and sort controls", async ({ page }) => {
  await page.route("**/api/v1/bingos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
    }),
  );
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  await expect(page.getByLabel("Search by title")).toBeVisible();
  await expect(page.getByLabel("Author")).toBeVisible();
  await expect(page.getByLabel("Tags")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Popular/ })).toBeChecked();
});

test("explore suggests public authors and tags and lets active filters be removed", async ({
  page,
}) => {
  await page.route("**/api/v1/bingos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
    }),
  );
  await page.route("**/api/v1/tags/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Travel",
            slug: "travel",
            usage_count: 4,
          },
        ],
      }),
    }),
  );
  await page.route("**/api/v1/authors/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            username: "ada",
            display_name: "Ada Lovelace",
          },
        ],
      }),
    }),
  );
  await page.goto("/explore?search=summer&author=ada&tags=travel%2Cfriends&ordering=newest");

  await expect(page.getByRole("button", { name: "Remove title filter: summer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove author filter: ada" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove tag filter: friends" })).toBeVisible();
  await page.getByRole("button", { name: "Remove tag filter: friends" }).click();
  await expect(page).toHaveURL(/tags=travel/);
  await expect(page).not.toHaveURL(/friends/);

  await page.getByLabel("Tags").fill("tra");
  await expect(page.locator('#explore-tag-suggestions option[value="travel"]')).toHaveCount(1);

  const authorInput = page.getByRole("combobox", { name: "Author" });
  await expect(authorInput).toHaveAttribute("list", "explore-author-suggestions");
  await authorInput.fill("ad");
  await expect(page.locator('#explore-author-suggestions option[value="ada"]')).toHaveAttribute(
    "label",
    "Ada Lovelace (@ada)",
  );
});

test("Explore keeps search visibly busy until a slow result arrives", async ({ page }) => {
  const emptyPage = { count: 0, next: null, previous: null, results: [] };
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/v1/interactions/", (route) => route.fulfill({ status: 204 }));
  let releaseSlowResponse = () => {};
  let reportSlowRequest = () => {};
  const slowResponse = new Promise<void>((resolve) => {
    releaseSlowResponse = resolve;
  });
  const slowRequest = new Promise<void>((resolve) => {
    reportSlowRequest = resolve;
  });
  await page.route("**/api/v1/bingos/**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("search") === "slow") {
      reportSlowRequest();
      await slowResponse;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPage),
    });
  });

  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "No matching bingos" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search by title" }).fill("slow");
  await page.getByRole("searchbox", { name: "Search by title" }).press("Enter");
  await slowRequest;
  await expect(page.locator("main#main-content")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".results-count")).toContainText("Updating results");
  releaseSlowResponse();
  await expect(page.locator("main#main-content")).toHaveAttribute("aria-busy", "false");
});

test("Explore waits for the last author-suggestion query", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/api/v1/bingos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
    }),
  );
  await page.route("**/api/v1/authors/**", (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("search") ?? "");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
    });
  });

  await page.goto("/explore");
  await expect(page.locator("main#main-content")).toHaveAttribute("aria-busy", "false");
  const author = page.getByRole("combobox", { name: "Author" });
  await author.fill("a");
  await author.fill("ad");
  await expect(author).toHaveValue("ad");
  await expect.poll(() => queries).toEqual(["ad"]);
});

test("board lists keep long titles, author names, and tags readable", async ({ page }) => {
  const title = "ExtremelyLongBingoTitleWithoutAnySpaces".repeat(2).slice(0, 70);
  const tag = "ExtremelyLongTagWithoutAnySpaces";
  await page.route("**/api/v1/feeds/discover/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            title,
            description: "",
            language: "en",
            author: {
              id: "22222222-2222-4222-8222-222222222222",
              username: "verylongusernamewithoutspaces",
              display_name: "VeryLongDisplayNameWithoutAnySpaces".repeat(2),
              avatar: null,
            },
            cover: null,
            preview: null,
            tags: [{ id: "33333333-3333-4333-8333-333333333333", name: tag, slug: "long-tag" }],
            size: 3,
            status: "published",
            visibility: "public",
            completion_style: "checkmark",
            stats: { likes: 0, comments: 0, plays: 0, shares: 0, views: 0 },
            liked_by_me: false,
            published_at: "2026-08-07T00:00:00Z",
            updated_at: "2026-08-07T00:00:00Z",
          },
        ],
      }),
    }),
  );

  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/discover");
    const card = page.getByRole("article");
    await expect(card.getByRole("heading", { name: title })).toBeVisible();
    await expect(card.getByRole("link", { name: `#${tag}` })).toBeVisible();
    const layout = await card.evaluate((element) => {
      const cardBox = element.getBoundingClientRect();
      const titleBox = element.querySelector("h2")?.getBoundingClientRect();
      const authorBox = element.querySelector(".bingo-card__heading span")?.getBoundingClientRect();
      const tagBox = element.querySelector(".bingo-card__tags a")?.getBoundingClientRect();
      return {
        cardRight: cardBox.right,
        titleRight: titleBox?.right ?? Infinity,
        authorRight: authorBox?.right ?? Infinity,
        tagRight: tagBox?.right ?? Infinity,
        tagBottom: tagBox?.bottom ?? Infinity,
        cardBottom: cardBox.bottom,
      };
    });
    expect(layout.titleRight).toBeLessThanOrEqual(layout.cardRight);
    expect(layout.authorRight).toBeLessThanOrEqual(layout.cardRight);
    expect(layout.tagRight).toBeLessThanOrEqual(layout.cardRight);
    expect(layout.tagBottom).toBeLessThanOrEqual(layout.cardBottom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await expect(page.locator("body")).not.toContainText("undefined");
  }
});

test("Explore pagination keeps its page in the URL and restores the selected board", async ({
  page,
}) => {
  const summary = (id: string, title: string) => ({
    id,
    title,
    description: "",
    language: "en",
    author: {
      id: "22222222-2222-4222-8222-222222222222",
      username: "author",
      display_name: "Author",
      avatar: null,
    },
    cover: null,
    preview: null,
    tags: [],
    size: 3,
    status: "published",
    visibility: "public",
    completion_style: "checkmark",
    stats: { likes: 0, comments: 0, plays: 0, shares: 0, views: 0 },
    liked_by_me: false,
    published_at: "2026-08-07T00:00:00Z",
    updated_at: "2026-08-07T00:00:00Z",
  });
  await page.route("**/api/v1/bingos/**", (route) => {
    const secondPage = new URL(route.request().url()).searchParams.get("page") === "2";
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 2,
        next: secondPage ? null : "?page=2",
        previous: secondPage ? "?page=1" : null,
        results: [
          secondPage
            ? summary("22222222-2222-4222-8222-222222222223", "Second board")
            : summary("11111111-1111-4111-8111-111111111111", "First board"),
        ],
      }),
    });
  });
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/v1/interactions/", (route) => route.fulfill({ status: 204 }));

  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "First board" })).toBeVisible();
  const pagination = page.getByRole("navigation", { name: "Explore pages" });
  await pagination.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/explore\?page=2$/);
  await expect(page.getByRole("heading", { name: "Second board" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Second board" })).toBeVisible();
  await pagination.getByRole("button", { name: "Previous" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole("heading", { name: "First board" })).toBeVisible();
});

test("create opens the coordinate-safe editor", async ({ page }) => {
  await page.unroute("**/api/v1/auth/session/");
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          username: "author",
          display_name: "Author",
          avatar: null,
          email: "author@example.test",
          email_verified: true,
          deletion_scheduled_for: null,
        },
      }),
    }),
  );
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Create bingo" })).toBeVisible();
  await expect(page.getByRole("grid", { name: /5 by 5 bingo board/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Increase bingo size" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish creating" })).toBeVisible();
});
