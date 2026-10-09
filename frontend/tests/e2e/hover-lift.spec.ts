import { expect, test } from "@playwright/test";

const liftedTransform = "matrix(1, 0, 0, 1, -3, -3)";
const softShadow = "rgba(0, 0, 0, 0.28) 0px 3px 10px 0px";
const bingo = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Hover test board",
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
  published_at: "2026-10-02T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
};
const results = { count: 1, next: null, previous: null, results: [bingo] };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/v1/auth/session/", (route) => route.fulfill({ json: { user: null } }));
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ json: { csrf_token: "test" } }),
  );
  await page.route("**/api/v1/feeds/discover/**", (route) => route.fulfill({ json: results }));
  await page.route("**/api/v1/feeds/trending/**", (route) => route.fulfill({ json: results }));
  await page.route("**/api/v1/bingos/?*", (route) => route.fulfill({ json: results }));
  await page.route("**/api/v1/interactions/", (route) => route.fulfill({ status: 204, body: "" }));
});

test("opaque header stays fixed with a soft shadow after scrolling", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();
  const header = page.getByRole("banner");
  await expect(header).toHaveCSS("position", "fixed");
  await expect(page.locator("html")).toHaveCSS("overscroll-behavior-y", "auto");
  await expect(page.locator("body")).toHaveCSS("overscroll-behavior-y", "auto");
  await expect(header).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(header).toHaveCSS("box-shadow", "none");
  const initialBounds = await header.boundingBox();
  expect(initialBounds!.y).toBe(0);
  expect((await page.locator("main").boundingBox())!.y).toBeGreaterThanOrEqual(
    initialBounds!.height,
  );
  for (const position of [1, 250]) {
    await page.evaluate((top) => scrollTo(0, top), position);
    await expect(header).toHaveCSS("box-shadow", softShadow);
    const bounds = await header.boundingBox();
    expect(bounds!.y).toBe(0);
    expect(bounds!.height).toBe(initialBounds!.height);
  }
  await header.hover();
  await expect(header).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.mouse.move(0, 300);
  await expect(header).toHaveCSS("box-shadow", softShadow);

  await page.evaluate(() => scrollTo(0, 0));
  await expect(header).toHaveCSS("box-shadow", "none");
  await page.evaluate(() => scrollTo(0, 250));
  await expect(header).toHaveClass(/\bis-scrolled\b/);
  await header.getByRole("link", { name: "Trending", exact: true }).click();
  await page.waitForURL("**/trending");
  await expect(page.getByRole("heading", { name: "Trending", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(header).toHaveCSS("box-shadow", "none");
  await page.mouse.move(0, 300);
  await page.mouse.wheel(0, -600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  expect((await header.boundingBox())!.y).toBe(0);
  await expect(header).toHaveCSS("box-shadow", "none");
});

test("panels lie flat until pointer hover and touch devices never lift", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();
  const canHover = await page.evaluate(
    () => matchMedia("(hover: hover) and (pointer: fine)").matches,
  );

  for (const selector of [".product-intro", ".bingo-card"]) {
    const surface = page.locator(selector);
    await expect(surface).toHaveClass(/\bhover-lift\b/);
    await surface.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(surface).toHaveCSS("transform", "none");
    await expect(surface).toHaveCSS("box-shadow", "none");
    await expect(surface).toHaveCSS("transition-duration", canHover ? "0.15s, 0.15s" : "0s");
    const position = await surface.evaluate((element: HTMLElement) => ({
      top: element.offsetTop,
      left: element.offsetLeft,
    }));
    await surface.hover();
    await expect(surface).toHaveCSS("transform", canHover ? liftedTransform : "none");
    await expect(surface).toHaveCSS("box-shadow", canHover ? softShadow : "none");
    expect(
      await surface.evaluate((element: HTMLElement) => ({
        top: element.offsetTop,
        left: element.offsetLeft,
      })),
    ).toEqual(position);
    await page.mouse.move(0, 0);
    await expect(surface).toHaveCSS("transform", "none");
    await expect(surface).toHaveCSS("box-shadow", "none");
  }
});

test("existing accounts see no language prompt and search filters lift only on hover", async ({
  page,
}) => {
  const user = { ...bingo.author, email: "author@example.test", email_verified: true };
  await page.route("**/api/v1/auth/session/", (route) => route.fulfill({ json: { user } }));
  await page.route("**/api/v1/profiles/me/", (route) =>
    route.fulfill({
      json: { ...user, preferred_languages: ["en"], language_preferences_confirmed: false },
    }),
  );
  await page.route("**/api/v1/notifications/unread-count/", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.goto("/discover");
  const canHover = await page.evaluate(
    () => matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/explore");
  await expect(page.getByRole("group", { name: "Bingo languages" })).toHaveCount(0);
  const filters = page.getByRole("group", { name: "Search filters", exact: true });
  await expect(filters).toHaveClass(/\bhover-lift\b/);
  await expect(filters).toBeEnabled();
  await page.getByRole("searchbox", { name: "Search by title" }).focus();
  await page.mouse.move(0, 0);
  await expect(filters).toHaveCSS("transform", "none");
  await expect(filters).toHaveCSS("box-shadow", "none");
  await filters.hover();
  await expect(filters).toHaveCSS("transform", canHover ? liftedTransform : "none");
  await expect(filters).toHaveCSS("box-shadow", canHover ? softShadow : "none");
  await page.mouse.move(0, 0);
  await expect(filters).toHaveCSS("transform", "none");
  await expect(filters).toHaveCSS("box-shadow", "none");
});

test("intro fits a narrow viewport and stays flat after keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/discover");
  const intro = page.locator(".product-intro");
  await intro.getByRole("link", { name: "Find a bingo" }).focus();
  await page.mouse.move(0, 0);
  await expect(intro).toHaveCSS("transform", "none");
  await expect(intro).toHaveCSS("box-shadow", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const bounds = await intro.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width + 6).toBeLessThanOrEqual(320);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("reduced motion keeps pointer hover feedback without displacement", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/discover");
  const canHover = await page.evaluate(
    () => matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  const intro = page.locator(".product-intro");
  await intro.hover();
  await expect(intro).toHaveCSS("transform", "none");
  await expect(intro).toHaveCSS("box-shadow", canHover ? softShadow : "none");
  await intro.getByRole("link", { name: "Find a bingo" }).focus();
  await page.mouse.move(0, 0);
  await expect(intro).toHaveCSS("transform", "none");
  await expect(intro).toHaveCSS("box-shadow", "none");
});
