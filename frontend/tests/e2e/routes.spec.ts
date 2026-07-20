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
  await expect(page.getByRole("link", { name: "Create", exact: true })).toBeVisible();
  await expect(page.getByText("For You")).toHaveCount(0);
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
