import { expect, test } from "@playwright/test";

import { readLiveFixture } from "./live-fixture";

test("mobile WebKit guest can play, persist progress, and open an immutable share", async ({
  page,
}) => {
  const bingo = readLiveFixture().bingos.public;

  await page.goto(`/bingo/${bingo.id}`);
  await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();
  await expect(page.getByText(`0 of ${bingo.cell_ids.length} selected`)).toBeVisible();

  await page.getByRole("button", { name: bingo.cell_texts[0], exact: true }).tap();
  await expect(page.getByText(`1 of ${bingo.cell_ids.length} selected`)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: `${bingo.cell_texts[0]}, selected` }),
  ).toHaveAttribute("aria-pressed", "true");

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    minimumTarget: Math.min(
      ...Array.from(document.querySelectorAll<HTMLElement>(".play-cell"), (cell) =>
        Math.min(cell.getBoundingClientRect().width, cell.getBoundingClientRect().height),
      ),
    ),
  }));
  expect(layout.pageWidth).toBe(layout.viewport);
  expect(layout.minimumTarget).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Share result" }).tap();
  await page.getByLabel("Your nickname").fill("Mobile WebKit");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/bingos/${bingo.id}/shares/`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create share link" }).tap();
  expect((await responsePromise).ok()).toBe(true);

  await expect(page).toHaveURL(new RegExp(`/share/${bingo.id}/[^/]+$`));
  await expect(page.getByText("Shared by Mobile WebKit")).toBeVisible();
  await expect(page.getByRole("gridcell")).toHaveCount(bingo.cell_ids.length);
  await page.locator(".play-cell").first().tap();
  await expect(page.locator(".play-cell-detail")).toContainText(bingo.cell_texts[0]!);
  await expect(page.getByText(`1 of ${bingo.cell_ids.length} selected`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Play this bingo" })).toBeVisible();
});

test("mobile WebKit catalog and play-mark controls work without overflow", async ({ page }) => {
  const bingo = readLiveFixture().bingos.public;

  await page.goto("/discover");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator(".bingo-card").filter({ hasText: bingo.title })).toBeVisible();

  await page.goto(`/bingo/${bingo.id}`);
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator(".play-cell").first()).toBeEnabled();
  const markStyleDisclosure = page.locator(".play-mark-disclosure > summary");
  if (await markStyleDisclosure.isVisible()) await markStyleDisclosure.click();
  await page.getByRole("radio", { name: "Cross" }).check();
  await page.getByRole("button", { name: bingo.cell_texts[0], exact: true }).tap();
  await expect(page.locator(".completion-check")).toHaveText("×");
  await page.getByRole("radio", { name: "Cross" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Checkmark" })).toBeChecked();
  await expect(page.locator(".completion-check")).toHaveText("✓");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Diagonal line" })).toBeChecked();
  await expect(page.locator(".play-board")).toHaveAttribute("data-completion-style", "crossout");

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    minimumMarkTarget: Math.min(
      ...Array.from(
        document.querySelectorAll<HTMLElement>(".play-mark-menu label"),
        (label) => label.getBoundingClientRect().height,
      ),
    ),
  }));
  expect(layout.pageWidth).toBe(layout.viewport);
  expect(layout.minimumMarkTarget).toBeGreaterThanOrEqual(44);
});

test("mobile navigation, card, and footer actions have usable touch targets", async ({ page }) => {
  await page.goto("/discover");
  await expect(page.locator(".bingo-card").first()).toBeVisible();
  await expect(async () => {
    const geometry = await page
      .locator(
        ".site-header a, .bingo-card__tags a, .bingo-card__actions a, .bingo-card__actions button, .site-footer a",
      )
      .evaluateAll((elements) => ({
        targets: elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            name: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
            width: bounds.width,
            height: bounds.height,
          };
        }),
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
    expect(geometry.targets.length).toBeGreaterThan(10);
    for (const target of geometry.targets) {
      expect(target.width, `${target.name} touch width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.name} touch height`).toBeGreaterThanOrEqual(44);
    }
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
  }).toPass({ timeout: 10_000 });
  await page.getByRole("link", { name: "Explore", exact: true }).tap();
  await expect(page).toHaveURL(/\/explore$/);
  await page.getByRole("link", { name: "Discover", exact: true }).tap();
  await expect(page).toHaveURL(/\/discover$/);
  await expect(page.getByRole("group", { name: "Show bingos in" })).toHaveCount(0);
});
