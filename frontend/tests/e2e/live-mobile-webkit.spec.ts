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

test("mobile WebKit language and play-mark controls work without overflow", async ({ page }) => {
  const bingo = readLiveFixture().bingos.public;

  await page.goto("/discover");
  await page.locator(".language-filter summary").tap();
  const languages = page.getByRole("group", { name: "Show bingos in" });
  await languages.getByLabel("Russian").check();
  await expect(page.getByRole("heading", { name: "No bingos in these languages" })).toBeVisible();
  await languages.getByLabel("English").check();
  await expect(page.locator(".bingo-card").filter({ hasText: bingo.title })).toBeVisible();
  await page.locator(".language-filter summary").focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".language-filter")).not.toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(languages.getByLabel("English")).toBeVisible();

  const languageTargetHeight = await page
    .locator(".language-options label")
    .first()
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(languageTargetHeight).toBeGreaterThanOrEqual(44);

  await page.goto(`/bingo/${bingo.id}`);
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
