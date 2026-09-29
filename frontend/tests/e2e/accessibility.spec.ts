import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const emptyPage = { count: 0, next: null, previous: null, results: [] };

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

const author = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "author",
  display_name: "Author",
  avatar: null,
};

const revision = {
  id: "33333333-3333-4333-8333-333333333333",
  number: 1,
  title: "Accessible Bingo",
  description: "A board used by the accessibility smoke suite.",
  size: 3,
  board_background: null,
  cover: null,
  completion_style: "checkmark",
  cells,
  published_at: "2026-08-07T00:00:00Z",
};

async function mockGuest(page: Page) {
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
}

async function expectNoSeriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious,
    serious
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes.map((node) => node.target.join(" ")).join("\n")}`,
      )
      .join("\n\n"),
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await mockGuest(page);
});

test("Discover, Trending, and Explore have no serious automated accessibility violations", async ({
  page,
}) => {
  await page.route("**/api/v1/feeds/discover/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPage),
    }),
  );
  await page.route("**/api/v1/bingos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPage),
    }),
  );
  await page.route("**/api/v1/feeds/trending/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPage),
    }),
  );

  await page.goto("/discover");
  await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.goto("/trending");
  await expect(page.getByRole("heading", { name: "Trending" })).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "Explore" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("authentication and editor entry states pass the serious accessibility gate", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Join Not Enough Bingo" })).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.goto("/create");
  await expect(page.getByText("Log in to create")).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.route("**/api/v1/notifications/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_authenticated", message: "Login required." } }),
    }),
  );
  await page.goto("/notifications");
  await expect(page.getByText("Log in to view notifications")).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.unroute("**/api/v1/auth/me/");
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...author,
        email: "author@example.test",
        email_verified: true,
        deletion_scheduled_for: null,
      }),
    }),
  );
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "Create bingo" })).toBeVisible();
  await page.getByRole("gridcell").first().click();
  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("textbox", { name: "Text for row 1, column 1" })).toBeVisible();
  } else {
    await expect(page.getByLabel("Text", { exact: true })).toBeVisible();
  }
  await expectNoSeriousViolations(page);
});

test("public play, shared result, and profile states pass the serious accessibility gate", async ({
  page,
}) => {
  const bingoId = "11111111-1111-4111-8111-111111111111";
  const shareId = "share-accessibility";
  await page.route(`**/api/v1/bingos/${bingoId}/`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: bingoId,
        title: revision.title,
        description: revision.description,
        author,
        cover: null,
        preview: { size: 3, board_background: null, cells },
        tags: [],
        size: 3,
        status: "published",
        visibility: "public",
        completion_style: "checkmark",
        stats: { likes: 0, comments: 0, plays: 0, shares: 0, views: 0 },
        liked_by_me: false,
        published_at: revision.published_at,
        updated_at: revision.published_at,
        current_revision: revision,
        permissions: { can_edit: false, can_comment: false, can_like: false, can_report: false },
      }),
    }),
  );
  await page.route("**/api/v1/profiles/author/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...author,
        bio: "",
        follower_count: 0,
        following_count: 0,
        is_following: false,
        privacy: {
          show_bio: true,
          show_created_bingos: true,
          show_play_history: false,
          show_shared_results: false,
          show_followers: true,
          show_following: true,
        },
      }),
    }),
  );
  await page.route("**/api/v1/profiles/author/bingos/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPage),
    }),
  );
  await page.route(`**/api/v1/bingos/${bingoId}/comments/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPage),
    }),
  );
  await page.route(`**/api/v1/shares/${bingoId}/${shareId}/`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: shareId,
        bingo_id: bingoId,
        owner_display_name: "Guest Player",
        owner: null,
        revision,
        selected_cells: [cells[0]?.id],
        created_at: revision.published_at,
      }),
    }),
  );

  await page.goto(`/bingo/${bingoId}`);
  await expect(page.getByRole("heading", { name: revision.title })).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.goto(`/share/${bingoId}/${shareId}`);
  await expect(page.getByText("Shared by Guest Player")).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.goto("/profile/author");
  await expect(page.getByRole("heading", { name: "Author" })).toBeVisible();
  await expectNoSeriousViolations(page);
});
