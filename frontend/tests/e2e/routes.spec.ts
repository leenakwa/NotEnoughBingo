import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
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
    const tags = element.querySelector<HTMLElement>(".bingo-card__tags");
    const actions = element.querySelector<HTMLElement>(".bingo-card__actions");
    if (!tags || !actions) return null;
    const tagsBox = tags.getBoundingClientRect();
    const actionsBox = actions.getBoundingClientRect();
    return {
      adjacent: actions.previousElementSibling === tags,
      gap: Math.abs(actionsBox.top - tagsBox.bottom),
    };
  });
  expect(alignment).not.toBeNull();
  expect(alignment?.adjacent).toBe(true);
  expect(alignment?.gap).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Like Feedback board" }).click();
  await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`/bingo/${bingoId}`)}`);
  await expect(page.getByText("Authentication credentials were not provided.")).toHaveCount(0);
});

test("authenticated header keeps notification and profile actions", async ({ page }) => {
  await page.unroute("**/api/v1/auth/me/");
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "11111111-1111-4111-8111-111111111111",
        username: "author",
        display_name: "Author",
        avatar: null,
        email: "author@example.test",
        email_verified: true,
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

test("create opens the coordinate-safe editor", async ({ page }) => {
  await page.unroute("**/api/v1/auth/me/");
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "11111111-1111-4111-8111-111111111111",
        username: "author",
        display_name: "Author",
        avatar: null,
        email: "author@example.test",
        email_verified: true,
      }),
    }),
  );
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Create bingo" })).toBeVisible();
  await expect(page.getByRole("grid", { name: /5 by 5 bingo board/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Increase bingo size" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish creating" })).toBeVisible();
});
