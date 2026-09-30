import { expect, test } from "@playwright/test";

import { E2E_FIXTURE_PASSWORD, readLiveFixture } from "./live-fixture";

test("browse, filter, play, share, and start a draft across browser engines", async ({ page }) => {
  const bingo = readLiveFixture().bingos.public;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/discover");
  await expect(page.locator(".bingo-card").filter({ hasText: bingo.title })).toBeVisible();
  await page.locator(".language-filter summary").click();
  const languages = page.getByRole("group", { name: "Show bingos in" });
  await languages.getByLabel("Russian").check();
  await expect(page.getByRole("heading", { name: "No bingos in these languages" })).toBeVisible();
  await languages.getByLabel("English").check();
  await expect(page.locator(".bingo-card").filter({ hasText: bingo.title })).toBeVisible();

  await page.goto(`/bingo/${bingo.id}`);
  await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();
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
  await page.getByRole("button", { name: "Log in" }).click();
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
