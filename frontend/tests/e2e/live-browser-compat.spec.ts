import { expect, test } from "@playwright/test";

import { E2E_FIXTURE_PASSWORD, readLiveFixture } from "./live-fixture";

test("browse, filter, play, share, and start a draft across browser engines", async ({ page }) => {
  const bingo = readLiveFixture().bingos.public;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    // WebKit can abort Next's devtools stack-frame lookup when a reload cancels an RSC request.
    if (
      error.message.includes("/__nextjs_original-stack-frames") &&
      error.stack?.includes("next-devtools")
    ) {
      return;
    }
    pageErrors.push(error.message);
  });

  await page.goto("/discover");
  await expect(page.locator(".bingo-card").filter({ hasText: bingo.title })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search by title" }).fill(bingo.title);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("group", { name: "Bingo languages" })).toHaveCount(0);
  await expect(page.locator(".bingo-card").filter({ hasText: bingo.title })).toBeVisible();

  await page
    .locator(".bingo-card")
    .filter({ hasText: bingo.title })
    .locator(".bingo-card__main")
    .click();
  await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator(".play-cell").first()).toBeEnabled();
  const markStyleDisclosure = page.locator(".play-mark-disclosure > summary");
  if (await markStyleDisclosure.isVisible()) await markStyleDisclosure.click();
  await page.getByRole("radio", { name: "Cross" }).check();
  await page.getByRole("button", { name: bingo.cell_texts[0], exact: true }).click();
  await expect(page.locator(".completion-check")).toHaveText("×");
  await page.reload();
  await expect(
    page.getByRole("button", { name: `${bingo.cell_texts[0]}, selected` }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Share result" }).click();
  await page.getByLabel("Your nickname").fill("Browser check");
  await page.getByRole("button", { name: "Create share link" }).click();
  await expect(page).toHaveURL(new RegExp(`/share/${bingo.id}/[^/]+$`));
  await expect(page.getByText("Shared by Browser check")).toBeVisible();

  const author = readLiveFixture().users.author;
  await page.context().clearCookies();
  await page.goto("/login?next=%2Fcreate");
  await page.getByLabel("Email").fill(author.email);
  await page.getByLabel("Password").fill(E2E_FIXTURE_PASSWORD);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/auth/login/") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Log in" }).click();
  const loggedIn = await loginResponse;
  expect(loggedIn.status()).toBe(200);
  expect(loggedIn.request().headers()["x-csrftoken"]).toBeTruthy();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByRole("heading", { name: "Create bingo" })).toBeVisible();
  await page.getByRole("gridcell").first().locator("button").focus();
  await page.keyboard.press("C");
  const firstCell = page.getByRole("textbox", { name: "Text for row 1, column 1" });
  await expect(firstCell).toHaveValue("C");
  await firstCell.fill("Cross-browser draft");
  await expect(page).toHaveURL(/\/create\?bingo=[0-9a-f-]+$/);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("gridcell", { name: /Cross-browser draft/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("server-rendered mobile board keeps its position while scripts hydrate", async ({ page }) => {
  const bingo = readLiveFixture().bingos.public;
  await page.setViewportSize({ width: 320, height: 800 });
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  const heldScripts: string[] = [];
  const scriptRoute = async (route: import("@playwright/test").Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/_next/") && url.pathname.endsWith(".js")) {
      heldScripts.push(url.pathname);
      await scriptsReady;
    }
    await route.continue();
  };
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/*", scriptRoute);
  try {
    await page.goto(`/bingo/${bingo.id}`, { waitUntil: "commit" });
    const board = page.locator(".play-board");
    await expect(board).toBeVisible();
    await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();
    await expect(page.locator(".play-mark-disclosure > summary")).toBeVisible();
    await expect(page.locator(".play-mark-disclosure")).not.toHaveAttribute("open", "");
    await expect(page.locator(".play-cell").first()).toBeDisabled();
    const before = await board.boundingBox();
    expect(before).not.toBeNull();
    expect(heldScripts.length).toBeGreaterThan(0);
    releaseScripts();
    await expect(page.locator(".play-cell").first()).toBeEnabled();
    const after = await board.boundingBox();
    expect(after).not.toBeNull();
    expect(after!.y).toBeCloseTo(before!.y, 0);
    expect(after!.width).toBeCloseTo(before!.width, 0);
    expect(after!.height).toBeCloseTo(before!.height, 0);
    await expect(page.locator(".play-mark-disclosure")).not.toHaveAttribute("open", "");
    expect(pageErrors).toEqual([]);
  } finally {
    releaseScripts();
    await page.unroute("**/*", scriptRoute);
  }
});
