import { readFileSync } from "node:fs";

import type { APIRequestContext, BrowserContext, Page, Response } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { authStatePath, readLiveFixture, type FixtureRole } from "./live-fixture";

const mailpitBaseURL = (process.env.MAILPIT_BASE_URL ?? "http://localhost:8025").replace(/\/$/, "");
let moderationReportId = "";

async function authenticateAs(page: Page, role: FixtureRole) {
  const state = JSON.parse(readFileSync(authStatePath(role), "utf8")) as {
    cookies: Parameters<BrowserContext["addCookies"]>[0];
  };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
}

async function waitForResponse(
  page: Page,
  path: string,
  method: string,
  action: () => Promise<void>,
): Promise<Response> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(path) && response.request().method() === method.toUpperCase(),
  );
  await action();
  const response = await responsePromise;
  if (!response.ok()) {
    throw new Error(
      `${method.toUpperCase()} ${path} returned HTTP ${response.status()}: ${await response.text()}`,
    );
  }
  return response;
}

function messageRows(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const rows = record.messages ?? record.Messages;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const listResponse = await request.get(`${mailpitBaseURL}/api/v1/messages?limit=100`);
    if (listResponse.ok()) {
      const rows = messageRows(await listResponse.json());
      const matching = rows.find((row) =>
        JSON.stringify(row).toLowerCase().includes(email.toLowerCase()),
      );
      const messageId = matching?.ID ?? matching?.Id ?? matching?.id;
      if (typeof messageId === "string") {
        const detailResponse = await request.get(
          `${mailpitBaseURL}/api/v1/message/${encodeURIComponent(messageId)}`,
        );
        if (detailResponse.ok()) {
          const body = JSON.stringify(await detailResponse.json());
          const match = body.match(/https?:\/\/[^\\\s"'<>]+\/verify-email\?token=[A-Za-z0-9_-]+/);
          if (match) return match[0].replaceAll("\\u0026", "&");
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No verification email for ${email} arrived in Mailpit.`);
}

test.describe("live full-stack product flows", () => {
  test.describe.configure({ mode: "serial" });

  test("registration → Mailpit verification → login", async ({ page, request }, testInfo) => {
    const nonce = `${Date.now().toString(36)}${testInfo.retry}`;
    const email = `e2e-signup-${nonce}@example.test`;
    const username = `e2e_signup_${nonce}`.slice(0, 30);
    const password = "E2E-Signup-Password!2026";

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Join Not Enough Bingo" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await waitForResponse(page, "/api/v1/auth/register/", "POST", () =>
      page.getByRole("button", { name: "Create account" }).click(),
    );
    await expect(page).toHaveURL(new RegExp(`/verify-email\\?email=${encodeURIComponent(email)}`));
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    const link = new URL(await verificationLink(request, email));
    await page.goto(`${link.pathname}${link.search}`);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("link", { name: "Continue to login" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      page.getByRole("button", { name: "Log in" }).click(),
    );
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.locator('a[href="/profile"]')).toBeVisible();
  });

  test("author creates, saves, edits, and publishes a draft", async ({ page }, testInfo) => {
    const title = `E2E UI Created Board ${testInfo.retry}`;
    await authenticateAs(page, "author");
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Create bingo" })).toBeVisible();

    await page.getByRole("gridcell").first().click();
    await page.getByLabel("Text", { exact: true }).fill("Made something");
    await page.getByRole("button", { name: "Bold" }).click();
    await waitForResponse(page, "/api/v1/drafts/", "POST", () =>
      page.getByRole("button", { name: "Save draft" }).click(),
    );
    await expect(page).toHaveURL(/\/create\?bingo=[0-9a-f-]+$/);
    await expect(page.getByText(/^Draft saved at /)).toBeVisible();

    await page.getByRole("button", { name: "Finish creating →" }).click();
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Description").fill("Saved and published by Playwright.");
    await page.getByPlaceholder("Search or add a tag").fill("browser-tested");
    await page.getByRole("button", { name: "Add" }).click();
    await page.getByLabel("Visibility").selectOption("unlisted");
    await page.getByLabel("Cell completion style").selectOption("highlight");
    await waitForResponse(page, "/draft/", "PUT", () =>
      page.getByRole("button", { name: "Save draft" }).click(),
    );
    await expect(page.getByText(/^Draft saved at /)).toBeVisible();

    await waitForResponse(page, "/publish/", "POST", () =>
      page.getByRole("button", { name: "Publish bingo" }).click(),
    );
    await expect(page).toHaveURL(/\/bingo\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Made something" })).toBeVisible();
  });

  test("discover scales fixture text with the board and keeps it inside cells", async ({
    page,
  }) => {
    const fixture = readLiveFixture();
    const title = fixture.bingos.public.title;
    await page.goto("/discover");

    const card = page.locator(".bingo-card").filter({ hasText: title });
    await expect(card).toHaveCount(1);
    const metrics = await card.evaluate((element) => {
      const preview = element.querySelector<HTMLElement>(".bingo-card-preview");
      const textNodes = preview?.querySelectorAll<HTMLElement>(".bingo-card-preview__text");
      if (!preview || !textNodes?.length) return null;
      return {
        width: preview.getBoundingClientRect().width,
        fontSize: Number.parseFloat(getComputedStyle(textNodes[0]!).fontSize),
        allTextFits: Array.from(textNodes).every(
          (text) =>
            text.scrollWidth <= text.clientWidth + 1 && text.scrollHeight <= text.clientHeight + 1,
        ),
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.fontSize).toBeCloseTo((24 * (metrics?.width ?? 0)) / 760, 1);
    expect(metrics?.allTextFits).toBe(true);
  });

  test("guest progress resets, replays, shares, and stays read-only", async ({ page }) => {
    const fixture = readLiveFixture();
    const bingo = fixture.bingos.public;
    await page.goto(`/bingo/${bingo.id}`);
    await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();

    await page.getByRole("button", { name: bingo.cell_texts[0], exact: true }).click();
    await expect(page.getByText(`1 of ${bingo.cell_ids.length} selected`)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: `${bingo.cell_texts[0]}, selected` }),
    ).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByText(`0 of ${bingo.cell_ids.length} selected`)).toBeVisible();
    await page.getByRole("button", { name: bingo.cell_texts[1], exact: true }).click();
    await page.getByRole("button", { name: "Share result" }).click();
    await page.getByLabel("Your nickname").fill("Guest Browser");
    await waitForResponse(page, `/api/v1/bingos/${bingo.id}/shares/`, "POST", () =>
      page.getByRole("button", { name: "Create share link" }).click(),
    );

    await expect(page).toHaveURL(new RegExp(`/share/${bingo.id}/[^/]+$`));
    await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();
    await expect(page.getByText("Shared by Guest Browser")).toBeVisible();
    await expect(page.getByText("This is a read-only snapshot from revision 1.")).toBeVisible();
    await expect(page.getByRole("gridcell")).toHaveCount(bingo.cell_ids.length);
    for (const cell of await page.getByRole("gridcell").all()) {
      await expect(cell).toBeDisabled();
    }
    await expect(page.getByRole("link", { name: "Play this bingo" })).toHaveAttribute(
      "href",
      `/bingo/${bingo.id}`,
    );
  });

  test("registered progress is saved on the server and reset", async ({ page }) => {
    const fixture = readLiveFixture();
    const bingo = fixture.bingos.public;
    await authenticateAs(page, "player");
    await page.goto(`/bingo/${bingo.id}`);
    await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();

    await waitForResponse(page, `/api/v1/progress/${bingo.id}/`, "PUT", () =>
      page.getByRole("button", { name: bingo.cell_texts[2], exact: true }).click(),
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: `${bingo.cell_texts[2]}, selected` }),
    ).toHaveAttribute("aria-pressed", "true");

    await waitForResponse(page, `/api/v1/progress/${bingo.id}/`, "DELETE", () =>
      page.getByRole("button", { name: "Reset" }).click(),
    );
    await expect(page.getByText(`0 of ${bingo.cell_ids.length} selected`)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: bingo.cell_texts[2], exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("like, root comment, reply, comment like, follow, and report", async ({
    page,
  }, testInfo) => {
    const fixture = readLiveFixture();
    const bingo = fixture.bingos.public;
    const rootBody = `E2E root comment ${Date.now()}-${testInfo.retry}`;
    const replyBody = `E2E reply ${Date.now()}-${testInfo.retry}`;
    await authenticateAs(page, "player");
    await page.goto(`/bingo/${bingo.id}`);

    const bingoLike = page.getByRole("button", { name: /^Like ·/ });
    await expect(bingoLike).toBeVisible();
    await waitForResponse(page, `/api/v1/bingos/${bingo.id}/likes/`, "POST", () =>
      bingoLike.click(),
    );
    await expect(page.getByRole("button", { name: /^Liked ·/ })).toBeVisible();

    const follow = page.getByRole("button", { name: "Follow author" });
    await expect(follow).toBeVisible();
    await waitForResponse(page, `/api/v1/users/${fixture.users.author.id}/followers/`, "POST", () =>
      follow.click(),
    );
    await expect(page.getByRole("button", { name: "Following" })).toBeVisible();

    await page.getByLabel("Add a comment").fill(rootBody);
    const commentResponse = await waitForResponse(
      page,
      `/api/v1/bingos/${bingo.id}/comments/`,
      "POST",
      () => page.getByRole("button", { name: "Post comment" }).click(),
    );
    const comment = (await commentResponse.json()) as { id: string };
    const root = page.locator(`#comment-${comment.id}`);
    await expect(root).toContainText(rootBody);
    await waitForResponse(page, `/api/v1/comments/${comment.id}/likes/`, "POST", () =>
      root.getByRole("button", { name: /^Like ·/ }).click(),
    );
    await expect(root.getByRole("button", { name: /^Unlike ·/ })).toBeVisible();

    await root.getByRole("button", { name: "Reply" }).click();
    await root.getByLabel("Reply").fill(replyBody);
    await waitForResponse(page, `/api/v1/comments/${comment.id}/replies/`, "POST", () =>
      root.getByRole("button", { name: "Post reply" }).click(),
    );
    await expect(root).toContainText(replyBody);

    await page.getByRole("button", { name: "Report", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Report bingo" });
    await dialog.getByLabel("Reason").selectOption("other");
    await dialog
      .getByLabel("Additional context (optional)")
      .fill("Created by the live moderation scenario.");
    const reportResponse = await waitForResponse(page, "/api/v1/reports/", "POST", () =>
      dialog.getByRole("button", { name: "Send report" }).click(),
    );
    const report = (await reportResponse.json()) as { report_id: string; status: string };
    moderationReportId = report.report_id;
    expect(report.status).toBe("open");
    await expect(dialog.getByText("Report received.")).toBeVisible();
  });

  test("moderator resolves the report through Django Admin", async ({ page }) => {
    expect(moderationReportId).not.toBe("");
    await authenticateAs(page, "moderator");
    await page.goto("/admin/moderation/report/");
    await expect(page).toHaveURL(/\/admin\/moderation\/report\/$/);

    const row = page.locator("#result_list tbody tr").filter({ hasText: moderationReportId });
    await expect(row).toBeVisible();
    await row.locator('input[name="_selected_action"]').check();
    await page.locator('select[name="action"]').selectOption("resolve_without_action");
    await page.getByRole("button", { name: "Go" }).click();
    await expect(page.getByText("Processed 1 report(s).")).toBeVisible();
    await expect(
      page.locator("#result_list tbody tr").filter({ hasText: moderationReportId }),
    ).toContainText("Resolved");
  });

  test("public, unlisted, and private visibility is enforced", async ({ page }) => {
    const fixture = readLiveFixture();
    const publicResponse = await page.request.get(`/api/v1/bingos/${fixture.bingos.public.id}/`);
    const unlistedResponse = await page.request.get(
      `/api/v1/bingos/${fixture.bingos.unlisted.id}/`,
    );
    const privateResponse = await page.request.get(`/api/v1/bingos/${fixture.bingos.private.id}/`);
    expect(publicResponse.status()).toBe(200);
    expect(unlistedResponse.status()).toBe(200);
    expect(privateResponse.status()).toBe(404);

    await page.goto(`/bingo/${fixture.bingos.unlisted.id}`);
    await expect(page.getByRole("heading", { name: fixture.bingos.unlisted.title })).toBeVisible();
    await page.goto(`/bingo/${fixture.bingos.private.id}`);
    await expect(page.getByRole("alert")).toBeVisible();

    await authenticateAs(page, "author");
    const ownerResponse = await page.request.get(`/api/v1/bingos/${fixture.bingos.private.id}/`);
    expect(ownerResponse.status()).toBe(200);
    await page.goto(`/bingo/${fixture.bingos.private.id}`);
    await expect(page.getByRole("heading", { name: fixture.bingos.private.title })).toBeVisible();
  });

  test("a new publication leaves the old shared revision unchanged", async ({ page }, testInfo) => {
    const fixture = readLiveFixture();
    const snapshot = fixture.revision_snapshot;
    const sharePath = `/share/${snapshot.bingo_id}/${snapshot.share_id}`;
    await page.goto(sharePath);
    await expect(page.getByRole("heading", { name: snapshot.title })).toBeVisible();
    await expect(
      page.getByText(`This is a read-only snapshot from revision ${snapshot.revision_number}.`),
    ).toBeVisible();

    await authenticateAs(page, "author");
    await page.goto(`/create?bingo=${snapshot.bingo_id}`);
    await expect(page.getByRole("heading", { name: "Edit bingo" })).toBeVisible();
    await page.getByRole("button", { name: "Finish creating →" }).click();
    const nextTitle = `E2E Revision Board Updated ${testInfo.retry + 2}`;
    await page.getByLabel("Title").fill(nextTitle);
    const publishResponse = await waitForResponse(page, "/publish/", "POST", () =>
      page.getByRole("button", { name: "Publish bingo" }).click(),
    );
    const published = (await publishResponse.json()) as {
      current_revision: { number: number; title: string };
    };
    expect(published.current_revision.number).toBeGreaterThan(snapshot.revision_number);
    expect(published.current_revision.title).toBe(nextTitle);
    await expect(page.getByRole("heading", { name: nextTitle })).toBeVisible();

    await page.goto(sharePath);
    await expect(page.getByRole("heading", { name: snapshot.title })).toBeVisible();
    await expect(
      page.getByText(`This is a read-only snapshot from revision ${snapshot.revision_number}.`),
    ).toBeVisible();
    await expect(page.getByRole("gridcell").first()).toBeDisabled();
    await page.getByRole("link", { name: "Play this bingo" }).click();
    await expect(page.getByRole("heading", { name: nextTitle })).toBeVisible();
  });
});
