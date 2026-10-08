import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 320, height: 800 }, hasTouch: true });

const bingoId = "11111111-1111-4111-8111-111111111111";
const author = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "author",
  display_name: "Author",
  avatar: null,
};
const longCellText = "A deliberately long cell label that must stay clipped inside";
const responsiveWidths = [320, 375, 390, 412, 430, 768, 1024, 1280, 1440, 1710, 2560];
const cells = Array.from({ length: 100 }, (_, index) => ({
  id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
  row: Math.floor(index / 10),
  column: index % 10,
  text: index === 0 ? longCellText : `Cell ${index + 1}`,
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
  border_style: "solid",
}));
const revision = {
  id: "44444444-4444-4444-8444-444444444444",
  number: 1,
  title: "Large mobile bingo",
  description: "Ten by ten mobile layout regression fixture.",
  size: 10,
  board_background: null,
  cover: null,
  completion_style: "highlight",
  cells,
  published_at: "2026-08-07T00:00:00Z",
};

async function mockLargeBingo(page: Page, reportable = false) {
  await page.route("**/api/v1/interactions/", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/v1/notifications/unread-count/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"unread_count":0}' }),
  );
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: reportable
          ? {
              id: "66666666-6666-4666-8666-666666666666",
              username: "viewer",
              display_name: "Viewer",
              email: "viewer@example.test",
              email_verified: true,
              avatar: null,
              deletion_scheduled_for: null,
            }
          : null,
      }),
    }),
  );
  if (reportable) {
    await page.route(`**/api/v1/progress/${bingoId}/`, (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
    );
    await page.route("**/api/v1/auth/csrf/", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"csrf_token":"test"}',
      }),
    );
  }
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_authenticated", message: "Login required." } }),
    }),
  );
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
        preview: { size: 10, board_background: null, cells },
        tags: [],
        size: 10,
        status: "published",
        visibility: "public",
        completion_style: "highlight",
        stats: { likes: 0, comments: 0, plays: 0, shares: 0, views: 0 },
        liked_by_me: false,
        published_at: revision.published_at,
        updated_at: revision.published_at,
        current_revision: revision,
        permissions: {
          can_edit: false,
          can_comment: false,
          can_like: false,
          can_report: reportable,
        },
      }),
    }),
  );
  await page.route("**/api/v1/profiles/author/", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route(`**/api/v1/bingos/${bingoId}/comments/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
    }),
  );
}

async function mockLargeEditor(page: Page) {
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"csrf_token":"test"}' }),
  );
  await page.route("**/api/v1/notifications/unread-count/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"unread_count":0}' }),
  );
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          ...author,
          email: "author@example.test",
          email_verified: true,
          deletion_scheduled_for: null,
        },
      }),
    }),
  );
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
  await page.route(`**/api/v1/bingos/${bingoId}/draft/`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "55555555-5555-4555-8555-555555555555",
        bingo_id: bingoId,
        title: "Large mobile draft",
        description: "Ten by ten editor regression fixture.",
        size: 10,
        visibility: "private",
        completion_style: "highlight",
        board_background: null,
        cover: null,
        tags: [],
        cells,
        updated_at: "2026-08-07T00:00:00Z",
        version: 3,
      }),
    }),
  );
  await page.route(`**/api/v1/bingos/${bingoId}/`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: bingoId,
        title: "",
        description: "",
        author,
        cover: null,
        preview: null,
        tags: [],
        size: 5,
        status: "draft",
        visibility: "private",
        completion_style: "highlight",
        stats: { likes: 0, comments: 0, plays: 0, shares: 0, views: 0 },
        liked_by_me: false,
        published_at: null,
        updated_at: "2026-08-07T00:00:00Z",
        current_revision: null,
        permissions: { can_edit: true, can_comment: false, can_like: false, can_report: false },
      }),
    }),
  );
}

test("10×10 play stays usable at 320px without overflowing the page", async ({ page }) => {
  await mockLargeBingo(page);
  await page.goto(`/bingo/${bingoId}`);
  await expect(page.getByRole("heading", { name: revision.title })).toBeVisible();
  await expect(page.getByText("Scroll sideways to use this large board.")).toBeVisible();

  const layout = await page.evaluate(() => {
    const region = document.querySelector<HTMLElement>(".board-scroll-region");
    const board = document.querySelector<HTMLElement>(".play-board");
    const targets = Array.from(document.querySelectorAll<HTMLElement>(".play-cell"));
    const first = targets[0];
    if (!region || !board || !first) return null;
    const firstBox = first.getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      regionClientWidth: region.clientWidth,
      regionScrollWidth: region.scrollWidth,
      boardWidth: board.getBoundingClientRect().width,
      firstWidth: firstBox.width,
      firstHeight: firstBox.height,
      cellOverflow: getComputedStyle(first).overflow,
    };
  });

  expect(layout).not.toBeNull();
  expect(layout?.pageWidth).toBe(layout?.viewportWidth);
  expect(layout?.regionScrollWidth).toBeGreaterThan(layout?.regionClientWidth ?? 0);
  expect(layout?.boardWidth).toBeGreaterThanOrEqual(439);
  expect(layout?.firstWidth).toBeGreaterThanOrEqual(43);
  expect(layout?.firstHeight).toBeGreaterThanOrEqual(43);
  expect(layout?.cellOverflow).toBe("hidden");

  const firstCell = page.locator('[data-cell-position="0:0"]');
  await firstCell.tap();
  await expect(page.locator(".play-cell-detail")).toContainText(longCellText);
  await firstCell.tap();

  const lastCell = page.locator('[data-cell-position="9:9"]');
  await lastCell.scrollIntoViewIfNeeded();
  await lastCell.click();
  await expect(lastCell).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("1 of 100 selected")).toBeVisible();
});

test("10×10 editor pans deliberately and opens a usable mobile inspector", async ({ page }) => {
  await mockLargeEditor(page);
  await page.goto(`/create?bingo=${bingoId}`);
  await expect(page.getByRole("heading", { name: "Edit bingo" })).toBeVisible();
  await expect(
    page.getByText("Scroll sideways to edit this large board comfortably."),
  ).toBeVisible();
  await expect(page.getByRole("gridcell")).toHaveCount(100);

  const layout = await page.evaluate(() => {
    const region = document.querySelector<HTMLElement>(".board-scroll-region");
    const board = document.querySelector<HTMLElement>(".editor-board");
    const first = document.querySelector<HTMLElement>(".editor-cell");
    if (!region || !board || !first) return null;
    const firstBox = first.getBoundingClientRect();
    return {
      viewportWidth: document.documentElement.clientWidth,
      pageWidth: document.documentElement.scrollWidth,
      regionClientWidth: region.clientWidth,
      regionScrollWidth: region.scrollWidth,
      boardWidth: board.getBoundingClientRect().width,
      firstWidth: firstBox.width,
      firstHeight: firstBox.height,
      touchAction: getComputedStyle(board).touchAction,
    };
  });
  expect(layout).not.toBeNull();
  expect(layout?.pageWidth).toBe(layout?.viewportWidth);
  expect(layout?.regionScrollWidth).toBeGreaterThan(layout?.regionClientWidth ?? 0);
  expect(layout?.boardWidth).toBeGreaterThanOrEqual(439);
  expect(layout?.firstWidth).toBeGreaterThanOrEqual(43);
  expect(layout?.firstHeight).toBeGreaterThanOrEqual(43);
  expect(layout?.touchAction).toBe("pan-x pan-y");

  const lastCell = page.getByRole("gridcell", { name: /row 10, column 10/i });
  await lastCell.scrollIntoViewIfNeeded();
  await lastCell.tap();
  await page.keyboard.press("Escape");
  const inspector = page.getByRole("complementary", { name: "Cell editor" });
  await expect(inspector).toBeVisible();
  await expect(lastCell).toHaveAttribute("aria-selected", "true");
  await expect(inspector.getByLabel("Text", { exact: true })).toHaveValue("Cell 100");
  const inspectorLayout = await inspector.evaluate((element) => {
    const close = element.querySelector<HTMLElement>('[aria-label="Close cell editor"]');
    const closeBox = close?.getBoundingClientRect();
    return {
      position: getComputedStyle(element).position,
      width: element.getBoundingClientRect().width,
      closeWidth: closeBox?.width ?? 0,
      closeHeight: closeBox?.height ?? 0,
    };
  });
  expect(inspectorLayout.position).toBe("fixed");
  expect(inspectorLayout.width).toBeLessThanOrEqual(296);
  expect(inspectorLayout.closeWidth).toBeGreaterThanOrEqual(44);
  expect(inspectorLayout.closeHeight).toBeGreaterThanOrEqual(44);
  await page.getByRole("button", { name: "Close cell editor" }).tap();
  await expect(inspector).toBeHidden();
});

test("play stays inside the page across the responsive width gate", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One deterministic engine covers geometry.");
  test.setTimeout(90_000);
  await mockLargeBingo(page);

  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/bingo/${bingoId}`);
    await expect(page.getByRole("heading", { name: revision.title })).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      minimumCell: Math.min(
        ...Array.from(document.querySelectorAll<HTMLElement>(".play-cell"), (cell) =>
          Math.min(cell.getBoundingClientRect().width, cell.getBoundingClientRect().height),
        ),
      ),
    }));
    expect(geometry.page, `play overflow at ${width}px`).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.minimumCell, `play target at ${width}px`).toBeGreaterThanOrEqual(43);
  }
});

test("editor, inspector, and details stay bounded across responsive widths", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One deterministic engine covers geometry.");
  test.setTimeout(90_000);
  await mockLargeEditor(page);

  for (const width of responsiveWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/create?bingo=${bingoId}`);
    await expect(page.getByRole("heading", { name: "Edit bingo" })).toBeVisible();
    await page.getByRole("gridcell").first().tap();
    await expect(page.getByRole("complementary", { name: "Cell editor" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `editor overflow at ${width}px`,
    ).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth + 1));
    await page.getByRole("button", { name: "Close cell editor" }).tap();
    await page.getByRole("button", { name: "Finish creating →" }).tap();
    await expect(page.getByRole("heading", { name: "Almost there" })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `details overflow at ${width}px`,
    ).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth + 1));
  }
});

test("landscape and short viewports keep the editor inspector and sticky header usable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One deterministic engine covers geometry.");
  await mockLargeEditor(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`/create?bingo=${bingoId}`);
  await page.getByRole("gridcell").first().tap();
  const inspector = page.getByRole("complementary", { name: "Cell editor" });
  await expect(inspector).toBeVisible();

  for (const height of [390, 320]) {
    await page.setViewportSize({ width: 844, height });
    await inspector.getByRole("textbox", { name: "Text", exact: true }).focus();
    const bounds = await inspector.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      844,
    );
  }

  await page.getByRole("button", { name: "Close cell editor" }).tap();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const headerTop = await page
    .locator(".site-header")
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(headerTop).toBe(0);

  await page.setViewportSize({ width: 320, height: 500 });
  await page.goto(`/create?bingo=${bingoId}`);
  await page.getByRole("gridcell").first().tap();
  await expect(inspector).toBeVisible();
  await page.setViewportSize({ width: 320, height: 300 });
  await inspector.getByRole("textbox", { name: "Text", exact: true }).focus();
  const mobileBounds = await inspector.boundingBox();
  expect(mobileBounds).not.toBeNull();
  expect(mobileBounds!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds!.x + mobileBounds!.width).toBeLessThanOrEqual(320);
  expect(mobileBounds!.y + mobileBounds!.height).toBeLessThanOrEqual(300);
  await expect(page.getByRole("button", { name: "Close cell editor" })).toBeVisible();
});

test("report dialog scrolls within a short mobile viewport while the keyboard is simulated", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One deterministic engine covers geometry.");
  await mockLargeBingo(page, true);
  await page.setViewportSize({ width: 320, height: 500 });
  await page.goto(`/bingo/${bingoId}`);
  await page.getByRole("button", { name: "Report", exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: "Report bingo" });
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 320, height: 300 });
  await dialog.getByRole("textbox", { name: "Additional context (optional)" }).focus();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(300);
  await dialog.getByRole("button", { name: "Send report" }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("button", { name: "Send report" })).toBeInViewport();
  await dialog.getByRole("button", { name: "Cancel" }).tap();
  await expect(dialog).toBeHidden();
});

test("keyboard navigation stays inside a report dialog and returns to its trigger", async ({
  page,
}, testInfo) => {
  await mockLargeBingo(page, true);
  await page.goto(`/bingo/${bingoId}`);
  if (testInfo.project.name === "chromium") {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Not Enough Bingo home" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  }

  const trigger = page.getByRole("button", { name: "Report", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Report bingo" });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  for (const key of ["Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    const focus = await dialog.evaluate((element) => ({
      inside: element === document.activeElement || element.contains(document.activeElement),
      active: document.activeElement?.outerHTML.slice(0, 160),
    }));
    expect(focus.inside, `${key} focused ${focus.active}`).toBe(true);
  }
  const outline = await page.evaluate(() => {
    const focused = document.activeElement;
    return focused ? getComputedStyle(focused).outlineWidth : "0px";
  });
  expect(parseFloat(outline)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
