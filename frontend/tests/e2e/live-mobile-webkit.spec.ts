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
