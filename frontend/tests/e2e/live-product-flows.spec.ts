import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";

import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, BrowserContext, Page, Response } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  authStatePath,
  E2E_FIXTURE_PASSWORD,
  readLiveFixture,
  type FixtureRole,
} from "./live-fixture";

const mailpitBaseURL = (process.env.MAILPIT_BASE_URL ?? "http://localhost:8025").replace(/\/$/, "");
const cellImagePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAE0lEQVR4nGP8f4YBK2DCLjxYJQBrGAHb+/Mz+AAAAABJRU5ErkJggg==",
  "base64",
);
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

async function expectNoSeriousAccessibilityViolations(page: Page) {
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

async function passwordResetLink(request: APIRequestContext, email: string): Promise<string> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const listResponse = await request.get(`${mailpitBaseURL}/api/v1/messages?limit=100`);
    if (listResponse.ok()) {
      const rows = messageRows(await listResponse.json());
      const matching = rows.find((row) => {
        const text = JSON.stringify(row).toLowerCase();
        return (
          text.includes(email.toLowerCase()) &&
          text.includes("reset your not enough bingo password")
        );
      });
      const messageId = matching?.ID ?? matching?.Id ?? matching?.id;
      if (typeof messageId === "string") {
        const detailResponse = await request.get(
          `${mailpitBaseURL}/api/v1/message/${encodeURIComponent(messageId)}`,
        );
        if (detailResponse.ok()) {
          const body = JSON.stringify(await detailResponse.json());
          const match = body.match(
            /https?:\/\/[^\\\s"'<>]+\/reset-password\?uid=[A-Za-z0-9_-]+&token=[A-Za-z0-9_-]+/,
          );
          if (match) return match[0];
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No password-reset email for ${email} arrived in Mailpit.`);
}

async function emailChangeLink(request: APIRequestContext, email: string): Promise<string> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const listResponse = await request.get(`${mailpitBaseURL}/api/v1/messages?limit=100`);
    if (listResponse.ok()) {
      const rows = messageRows(await listResponse.json());
      const matching = rows.find((row) => {
        const text = JSON.stringify(row).toLowerCase();
        return (
          text.includes(email.toLowerCase()) &&
          text.includes("confirm your new not enough bingo email")
        );
      });
      const messageId = matching?.ID ?? matching?.Id ?? matching?.id;
      if (typeof messageId === "string") {
        const detailResponse = await request.get(
          `${mailpitBaseURL}/api/v1/message/${encodeURIComponent(messageId)}`,
        );
        if (detailResponse.ok()) {
          const body = JSON.stringify(await detailResponse.json());
          const match = body.match(
            /https?:\/\/[^\\\s"'<>]+\/confirm-email-change\?token=[A-Za-z0-9_-]+/,
          );
          if (match) return match[0];
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No email-change confirmation for ${email} arrived in Mailpit.`);
}

test.describe("live full-stack product flows", () => {
  test.describe.configure({ mode: "serial" });

  test("public frontend and backend health checks are reachable through Nginx", async ({
    request,
  }) => {
    for (const path of ["/api/health", "/api/v1/health/ready/"]) {
      const response = await request.get(path);
      expect(response.ok(), `${path} returned HTTP ${response.status()}`).toBe(true);
    }
    await expect
      .poll(async () => (await request.get("/api/v1/health/beat/")).status(), {
        timeout: 75_000,
        intervals: [1000, 2000, 5000],
      })
      .toBe(200);
  });

  test("public routes render without script errors, server failures, or narrow-screen overflow", async ({
    page,
  }) => {
    const fixture = readLiveFixture();
    const routes = [
      "/",
      "/discover",
      "/trending",
      "/explore",
      `/bingo/${fixture.bingos.public.id}`,
      `/profile/${fixture.users.author.username}`,
      `/share/${fixture.revision_snapshot.bingo_id}/${fixture.revision_snapshot.share_id}`,
      "/support",
      "/privacy",
      "/terms",
      "/community-guidelines",
      "/login",
      "/register",
      "/create",
      "/forgot-password",
      "/verify-email",
      "/reset-password",
      "/confirm-email-change",
    ];
    const pageErrors: string[] = [];
    const serverFailures: string[] = [];
    const guestAuthFailures: string[] = [];
    let checkingGuestRoutes = true;
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 500) serverFailures.push(`${response.status()} ${response.url()}`);
      if (
        checkingGuestRoutes &&
        (response.status() === 401 || response.status() === 403) &&
        /\/api\/v1\/(auth\/me|profiles\/me)\//.test(response.url())
      ) {
        guestAuthFailures.push(`${response.status()} ${response.url()}`);
      }
    });
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of routes) {
        const response = await page.goto(route);
        expect(response?.status(), route).toBe(200);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
            message: `${route} overflows at ${width}px`,
          })
          .toBeLessThanOrEqual(width);
      }
    }
    await page.goto("/discover");
    await page.getByRole("link", { name: "Create your own" }).click();
    await expect(page).toHaveURL(/\/create$/);
    await expect(
      page.getByRole("heading", { name: "Create your own bingo", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/register",
    );
    checkingGuestRoutes = false;
    expect(guestAuthFailures).toEqual([]);
    await authenticateAs(page, "author");
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/profile", "/notifications", "/create"]) {
        const response = await page.goto(route);
        expect(response?.status(), route).toBe(200);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
            message: `${route} overflows at ${width}px`,
          })
          .toBeLessThanOrEqual(width);
      }
    }
    expect(pageErrors).toEqual([]);
    expect(serverFailures).toEqual([]);
  });

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
    await waitForResponse(page, "/api/v1/auth/resend-verification/", "POST", () =>
      page.getByRole("button", { name: "Resend verification email" }).click(),
    );
    await expect(page.getByRole("status")).toContainText("check your inbox");

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
    await expect(
      page.getByRole("heading", { name: "Which bingo languages do you prefer?" }),
    ).toBeVisible();
    await page.getByRole("group", { name: "Preferred languages" }).getByLabel("Russian").check();
    await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      page.getByRole("button", { name: "Save preferences" }).click(),
    );
    await expect(
      page.getByRole("heading", { name: "Which bingo languages do you prefer?" }),
    ).toHaveCount(0);
  });

  test("author creates, saves, edits, and publishes a draft", async ({ page }, testInfo) => {
    const title = `E2E UI Created Board ${testInfo.retry}`;
    await authenticateAs(page, "author");
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Create bingo" })).toBeVisible();

    await page.getByRole("gridcell").first().click();
    await waitForResponse(page, "/api/v1/drafts/", "POST", async () => {
      await page.getByRole("textbox", { name: "Text for row 1, column 1" }).fill("Made something");
      await page.getByRole("button", { name: "Bold" }).click();
    });
    await expect(page).toHaveURL(/\/create\?bingo=[0-9a-f-]+$/);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await waitForResponse(page, "/draft/", "PUT", () =>
      page.getByLabel("Add image to cell").setInputFiles({
        name: "cell.png",
        mimeType: "image/png",
        buffer: cellImagePng,
      }),
    );
    await expect(page.getByRole("button", { name: "Remove cell image" })).toBeVisible();

    await page.reload();
    const persistedFirstCell = page.getByRole("gridcell", { name: /Made something/ });
    await expect(persistedFirstCell).toBeVisible();
    await persistedFirstCell.click();
    await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Remove cell image" })).toBeVisible();

    await persistedFirstCell.locator("button").press("Shift+ArrowRight");
    await expect(page.getByRole("heading", { name: "2 cells selected" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Set same text for 2 cells" })).toBeVisible();
    await expect(page.getByLabel("Text", { exact: true })).toHaveCount(0);
    await waitForResponse(page, "/draft/", "PUT", () =>
      page.getByRole("button", { name: "Italic" }).click(),
    );
    await page.reload();
    await expect(page.locator('[data-cell-key="0:0"] .editor-cell__image')).toBeVisible();
    await expect(page.locator('[data-cell-key="0:0"] .editor-cell__text')).toHaveCSS(
      "font-style",
      "italic",
    );
    await expect(page.locator('[data-cell-key="0:1"] .editor-cell__text')).toHaveCSS(
      "font-style",
      "italic",
    );

    await page.getByRole("button", { name: "Finish creating →" }).click();
    await waitForResponse(page, "/draft/", "PUT", async () => {
      await page.getByLabel("Title").fill(title);
      await page.getByLabel("Description").fill("Saved and published by Playwright.");
      await page.getByPlaceholder("Search or add a tag").fill("browser-tested");
      await page.getByRole("button", { name: "Add" }).click();
      await page.getByLabel("Visibility").selectOption("unlisted");
      await page.getByLabel("Bingo language").selectOption("en");
      await page.getByLabel("Cell completion style").selectOption("highlight");
    });
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await waitForResponse(page, "/publish/", "POST", () =>
      page.getByRole("button", { name: "Publish bingo" }).click(),
    );
    await expect(page).toHaveURL(/\/bingo\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Made something" })).toBeVisible();
  });

  test("publish requires a title, language, and at least one filled cell", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("button", { name: "Finish creating →" }).click();
    const publicationError = page.locator(".details-panel .form-message--error");
    await page.getByRole("button", { name: "Publish bingo" }).click();
    await expect(publicationError).toContainText("Add a title before publishing.");

    await page.getByLabel("Title").fill("A required fields test");
    await page.getByRole("button", { name: "Publish bingo" }).click();
    await expect(publicationError).toContainText("Choose a bingo language before publishing.");

    await page.getByLabel("Bingo language").selectOption("en");
    await page.getByRole("button", { name: "Publish bingo" }).click();
    await expect(publicationError).toContainText(
      "Add text or an image to at least one cell before publishing.",
    );

    await page.getByRole("button", { name: "Back to bingo" }).click();
    await page.getByRole("gridcell").first().click();
    await page
      .getByRole("textbox", { name: "Text for row 1, column 1" })
      .fill("At least one filled cell");
    await page.getByRole("button", { name: "Finish creating →" }).click();
    await waitForResponse(page, "/publish/", "POST", () =>
      page.getByRole("button", { name: "Publish bingo" }).click(),
    );
    await expect(page.getByRole("heading", { name: "A required fields test" })).toBeVisible();
  });

  test("drafts stay in a separate private profile category", async ({ page }) => {
    const fixture = readLiveFixture();
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("button", { name: "Finish creating →" }).click();
    await page.getByLabel("Title").fill("A separate draft category");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await page.goto("/profile");
    await page.getByRole("tab", { name: "Drafts" }).click();
    await expect(
      page.locator(".bingo-card").filter({ hasText: "A separate draft category" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Created" }).click();
    await expect(
      page.locator(".bingo-card").filter({ hasText: fixture.bingos.public.title }),
    ).toBeVisible();
    await expect(
      page.locator(".bingo-card").filter({ hasText: "A separate draft category" }),
    ).toHaveCount(0);

    await page.context().clearCookies();
    await page.goto(`/profile/${fixture.users.author.username}`);
    await expect(page.getByRole("tab", { name: "Drafts" })).toHaveCount(0);
    await expect(page.getByText("A separate draft category")).toHaveCount(0);
  });

  test("offline editor preserves work and retries when the connection returns", async ({
    page,
  }) => {
    const fixture = readLiveFixture();
    await authenticateAs(page, "author");
    await page.goto("/create");
    await expect(page.getByRole("gridcell").first()).toBeVisible();

    await page.context().setOffline(true);
    await page.getByRole("gridcell").first().click();
    await page
      .getByRole("textbox", { name: "Text for row 1, column 1" })
      .fill("Saved after reconnecting");
    await expect(page.locator(".save-status--failed")).toBeVisible();
    expect(
      await page.evaluate(
        (authorId) =>
          Array.from({ length: window.localStorage.length }, (_, index) =>
            window.localStorage.key(index),
          ).some((key) => key?.startsWith(`not-enough-bingo:editor-recovery:v2:${authorId}:`)),
        fixture.users.author.id,
      ),
    ).toBe(true);

    await page.context().setOffline(false);
    await waitForResponse(page, "/api/v1/drafts/", "POST", () =>
      page.getByRole("button", { name: "Retry now" }).click(),
    );
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("gridcell", { name: /Saved after reconnecting/ })).toBeVisible();
  });

  test("expired session preserves unsaved edits and returns to the draft after login", async ({
    page,
  }) => {
    const fixture = readLiveFixture();
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    await page.getByRole("textbox", { name: "Text for row 1, column 1" }).fill("Before expiry");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/create\?bingo=[0-9a-f-]+$/);
    const draftPath = new URL(page.url()).pathname + new URL(page.url()).search;

    await page.context().setOffline(true);
    await page
      .getByRole("textbox", { name: "Text for row 1, column 1" })
      .fill("Unsaved after expiry");
    await expect(page.locator(".save-status--failed")).toBeVisible();
    await page.context().setOffline(false);
    await page.context().clearCookies();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page).toHaveURL(/\/login\?reason=session-expired&next=/);
    await expect(
      page.getByText("Your session ended. Log in again to continue where you left off."),
    ).toBeVisible();

    page.on("dialog", (dialog) => void dialog.accept());
    await page.getByLabel("Email").fill(fixture.users.author.email);
    await page.getByLabel("Password").fill(E2E_FIXTURE_PASSWORD);
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      page.getByRole("button", { name: "Log in" }).click(),
    );
    await expect(page).toHaveURL(new RegExp(draftPath.replace("?", "\\?")));
    await expect(page.getByRole("gridcell", { name: /Unsaved after expiry/ })).toBeVisible();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("a protected action detects session expiry without a focus change", async ({ page }) => {
    const bingo = readLiveFixture().bingos.public;
    const fixture = readLiveFixture();
    await authenticateAs(page, "author");
    const initialProgress = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/v1/progress/${bingo.id}/`) &&
        response.request().method() === "GET",
    );
    await page.goto(`/bingo/${bingo.id}`);
    await expect(
      page.getByRole("button", { name: bingo.cell_texts[0], exact: true }),
    ).toBeVisible();
    await initialProgress;
    await expect(page.getByRole("button", { name: /^Like ·/ })).toBeVisible();
    await page.context().clearCookies();

    const denied = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/v1/progress/${bingo.id}/`) &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: bingo.cell_texts[0], exact: true }).click();
    expect((await denied).status()).toBe(403);
    await expect(page).toHaveURL(
      new RegExp(`/login\\?reason=session-expired&next=%2Fbingo%2F${bingo.id}$`),
    );
    await expect(
      page.getByText("Your session ended. Log in again to continue where you left off."),
    ).toBeVisible();

    await page.getByLabel("Email").fill(fixture.users.author.email);
    await page.getByLabel("Password").fill(E2E_FIXTURE_PASSWORD);
    const recoveredSave = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/v1/progress/${bingo.id}/`) &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      page.getByRole("button", { name: "Log in" }).click(),
    );
    await recoveredSave;
    await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
    await page.reload();
    await expect(
      page.getByRole("button", { name: `${bingo.cell_texts[0]}, selected` }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText(`1 of ${bingo.cell_ids.length} selected`)).toBeVisible();
  });

  test("invalid image uploads show useful errors without attaching an asset", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    const input = page.getByLabel("Add image to cell");

    await input.setInputFiles({
      name: "unsupported.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg></svg>"),
    });
    await expect(page.locator(".form-message--error")).toContainText(
      "Use a JPEG, PNG, WebP, or AVIF image.",
    );

    await input.setInputFiles({
      name: "too-large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(page.locator(".form-message--error")).toContainText(
      "The image must be no larger than 5 MB.",
    );

    const mismatched = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/uploads/intents/") &&
        response.request().method() === "POST",
    );
    await input.setInputFiles({
      name: "mismatched.jpg",
      mimeType: "image/png",
      buffer: cellImagePng,
    });
    expect((await mismatched).status()).toBe(400);
    await expect(page.locator(".form-message--error")).toContainText(
      "The filename extension does not match the image type.",
    );
    await expect(page.getByRole("button", { name: "Remove cell image" })).toHaveCount(0);

    await input.setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.locator(".form-message--error")).toContainText(
      "This file could not be read as an image. Choose another image.",
      { timeout: 30_000 },
    );
    await expect(page.getByRole("button", { name: "Remove cell image" })).toHaveCount(0);
  });

  test("image upload recovers after object storage fails", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    const input = page.getByLabel("Add image to cell");
    const applicationOrigin = new URL(page.url()).origin;
    let blocked = 0;
    await page.route("**/*", (route) => {
      if (
        route.request().method() === "POST" &&
        new URL(route.request().url()).origin !== applicationOrigin
      ) {
        blocked += 1;
        return route.fulfill({ status: 503, body: "Storage temporarily unavailable" });
      }
      return route.continue();
    });

    await input.setInputFiles({ name: "cell.png", mimeType: "image/png", buffer: cellImagePng });
    await expect(page.locator(".form-message--error")).toContainText(
      "Image upload failed. Check your connection and try again.",
    );
    expect(blocked).toBe(1);
    await expect(page.getByRole("button", { name: "Remove cell image" })).toHaveCount(0);

    await page.unroute("**/*");
    await input.setInputFiles({ name: "cell.png", mimeType: "image/png", buffer: cellImagePng });
    await expect(page.getByRole("button", { name: "Remove cell image" })).toBeVisible();
    await expect(page.locator(".form-message--error")).toHaveCount(0);
  });

  test("discover scales fixture text with the board and keeps it inside cells", async ({
    page,
  }) => {
    const fixture = readLiveFixture();
    const title = fixture.bingos.public.title;
    await page.goto("/discover");

    const card = page.locator(".bingo-card").filter({ hasText: title });
    await expect(card).toHaveCount(1);
    await expect(card.locator(".bingo-card-preview")).toBeVisible();
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

  test("language filters work by keyboard and fit narrow and wide screens", async ({ page }) => {
    const title = readLiveFixture().bingos.public.title;
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/discover");
      await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();
      await page.locator(".language-filter summary").focus();
      await page.keyboard.press("Enter");
      const picker = page.getByRole("group", { name: "Show bingos in" });
      await expect(picker.getByLabel("Russian")).toBeVisible();
      await picker.getByLabel("Russian").focus();
      await page.keyboard.press("Space");
      await expect(
        page.getByRole("heading", { name: "No bingos in these languages" }),
      ).toBeVisible();
      await picker.getByLabel("English").focus();
      await page.keyboard.press("Space");
      await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width + 1,
      );
      await page.getByRole("button", { name: "Show all languages" }).click();
      await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();
    }

    await page.goto("/explore");
    const picker = page.getByRole("group", { name: "Bingo languages" });
    await picker.getByLabel("English").check();
    await picker.getByLabel("Russian").check();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/languages=en&languages=ru/);
    await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();
    await page.reload();
    await expect(picker.getByLabel("English")).toBeChecked();
    await expect(picker.getByLabel("Russian")).toBeChecked();
  });

  test("authenticated language, play, editor, and account settings pass the accessibility gate", async ({
    page,
  }) => {
    const fixture = readLiveFixture();
    await authenticateAs(page, "author");
    await page.goto("/discover");
    await expect(
      page.getByRole("heading", { name: "Which bingo languages do you prefer?" }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await page.goto(`/bingo/${fixture.bingos.public.id}`);
    await expect(page.getByRole("group", { name: "Mark cells with" })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    await expect(page.getByRole("heading", { name: "Cell editor" })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("guest progress resets, replays, shares, and stays read-only", async ({ page }) => {
    const fixture = readLiveFixture();
    const bingo = fixture.bingos.public;
    await page.goto(`/bingo/${bingo.id}`);
    await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();

    await page.getByRole("radio", { name: "Cross" }).check();

    await page.getByRole("button", { name: bingo.cell_texts[0], exact: true }).click();
    await expect(page.locator(".completion-check")).toHaveText("×");
    await expect(page.getByText(`1 of ${bingo.cell_ids.length} selected`)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: `${bingo.cell_texts[0]}, selected` }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("radio", { name: "Cross" })).toBeChecked();
    await page.getByRole("radio", { name: "Diagonal line" }).check();
    await expect(page.locator(".play-board")).toHaveAttribute("data-completion-style", "crossout");

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
    const readOnlyCell = page.locator(".play-cell").first();
    await expect(readOnlyCell).toBeEnabled();
    await readOnlyCell.click();
    await expect(page.locator(".play-cell-detail")).toContainText(bingo.cell_texts[0]!);
    await expect(page.getByText(`1 of ${bingo.cell_ids.length} selected`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Play this bingo" })).toHaveAttribute(
      "href",
      `/bingo/${bingo.id}`,
    );
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByText("Link copied.")).toBeVisible();
    await expect(page.evaluate(() => navigator.clipboard.readText())).resolves.toBe(page.url());
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

  test("author notifications link to activity and mark all as read", async ({ page }) => {
    const bingo = readLiveFixture().bingos.public;
    await authenticateAs(page, "player");
    await page.goto(`/bingo/${bingo.id}`);
    await page.getByLabel("Add a comment").fill(`Notification check ${Date.now()}`);
    await waitForResponse(page, `/api/v1/bingos/${bingo.id}/comments/`, "POST", () =>
      page.getByRole("button", { name: "Post comment" }).click(),
    );
    await authenticateAs(page, "author");
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    const unreadBefore = await page.context().request.get("/api/v1/notifications/unread-count/");
    expect(unreadBefore.ok()).toBe(true);
    expect(((await unreadBefore.json()) as { count: number }).count).toBeGreaterThan(0);
    const unreadItems = page.locator(".notification-list li.is-unread");
    await expect(unreadItems.first()).toBeVisible();
    const target = await unreadItems.first().locator("a").getAttribute("href");
    expect(target).toMatch(/^\/(bingo|profile)\//);
    await waitForResponse(page, "/api/v1/notifications/read-all/", "POST", () =>
      page.getByRole("button", { name: "Mark all as read" }).click(),
    );
    await expect(page.locator(".notification-list li.is-unread")).toHaveCount(0);
    const unreadAfter = await page.context().request.get("/api/v1/notifications/unread-count/");
    expect(((await unreadAfter.json()) as { count: number }).count).toBe(0);
    await page.reload();
    await expect(page.locator(".notification-list li.is-unread")).toHaveCount(0);
    await page.locator(".notification-list a").first().click();
    await expect(page).toHaveURL(new URL(target!, page.url()).toString());
  });

  test("long multilingual profile content stays readable on narrow and wide screens", async ({
    page,
  }) => {
    const name = "Ж".repeat(80);
    const bio = `${"界".repeat(90)} 🎲 ${"A".repeat(90)}`;
    await authenticateAs(page, "author");
    await page.goto("/profile");
    const displayName = page.getByLabel("Display name");
    await displayName.fill(name);
    await displayName.press("Tab");
    await page.getByRole("textbox", { name: "Bio" }).fill(bio);
    await expect(displayName).toHaveValue(name);
    await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      page.getByRole("button", { name: "Save profile" }).click(),
    );
    await expect(page.getByRole("heading", { name })).toBeVisible();
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      await expect(page.locator(".profile-header")).toContainText(bio);
    }
    await page.reload();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  });

  test("account language, privacy, and notification preferences persist", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.goto("/profile");
    const languages = page.getByRole("group", { name: "Preferred languages" });
    await languages.getByLabel("English").check();
    await languages.getByLabel("Russian").check();
    await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      page.getByRole("button", { name: "Save languages" }).click(),
    );
    const privacy = page.getByRole("checkbox", { name: "Show bio" });
    await waitForResponse(page, "/api/v1/profiles/me/privacy/", "PUT", () => privacy.uncheck());
    const comments = page.getByRole("checkbox", { name: "New comments on my bingos" });
    await expect(comments).toBeChecked();
    await waitForResponse(page, "/api/v1/profiles/notification-preferences/", "PATCH", () =>
      comments.uncheck(),
    );
    await page.reload();
    await expect(languages.getByLabel("English")).toBeChecked();
    await expect(languages.getByLabel("Russian")).toBeChecked();
    await expect(privacy).not.toBeChecked();
    await expect(comments).not.toBeChecked();
    await expect(page.getByRole("link", { name: "Forgot your current password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
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
    const privatePage = await page.goto(`/bingo/${fixture.bingos.private.id}`);
    expect(privatePage?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Nothing on this square" })).toBeVisible();

    await authenticateAs(page, "author");
    const ownerResponse = await page.request.get(`/api/v1/bingos/${fixture.bingos.private.id}/`);
    expect(ownerResponse.status()).toBe(200);
    await page.goto(`/bingo/${fixture.bingos.private.id}`);
    await expect(page.getByRole("heading", { name: fixture.bingos.private.title })).toBeVisible();
  });

  test("missing public resources return a real 404 with a route home", async ({ page }) => {
    const paths = [
      "/bingo/11111111-1111-4111-8111-111111111111",
      "/share/11111111-1111-4111-8111-111111111111/missing",
      "/profile/notarealuserxy",
      "/this-route-does-not-exist",
    ];
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { name: "Nothing on this square" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Go to Discover" })).toHaveAttribute(
        "href",
        "/discover",
      );
    }
  });

  test("saved draft stays private until publish and old share stays immutable", async ({
    page,
  }, testInfo) => {
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
    const privateDraftTitle = `E2E Private Draft ${testInfo.retry + 1}`;
    await waitForResponse(page, "/draft/", "PUT", async () => {
      await page.getByLabel("Title").fill(privateDraftTitle);
      await page.getByLabel("Visibility").selectOption("private");
    });
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await page.context().clearCookies();
    const unchangedResponse = await page.request.get(`/api/v1/bingos/${snapshot.bingo_id}/`);
    expect(unchangedResponse.status()).toBe(200);
    await expect(unchangedResponse.json()).resolves.toMatchObject({
      title: snapshot.title,
      visibility: "public",
      current_revision: { title: snapshot.title, visibility: "public" },
    });
    await page.goto(`/bingo/${snapshot.bingo_id}`);
    await expect(page.getByRole("heading", { name: snapshot.title })).toBeVisible();
    await expect(page.getByText(privateDraftTitle)).toHaveCount(0);
    await page.goto(sharePath);
    await expect(page.getByRole("heading", { name: snapshot.title })).toBeVisible();

    await authenticateAs(page, "author");
    await page.goto(`/create?bingo=${snapshot.bingo_id}`);
    await page.getByRole("button", { name: "Finish creating →" }).click();
    const nextTitle = `E2E Revision Board Updated ${testInfo.retry + 2}`;
    await page.getByLabel("Title").fill(nextTitle);
    await page.getByLabel("Visibility").selectOption("public");
    const publishResponse = await waitForResponse(page, "/publish/", "POST", () =>
      page.getByRole("button", { name: "Publish bingo" }).click(),
    );
    const published = (await publishResponse.json()) as {
      current_revision: { number: number; title: string };
    };
    expect(published.current_revision.number).toBeGreaterThan(snapshot.revision_number);
    expect(published.current_revision.title).toBe(nextTitle);
    await expect(page.getByRole("heading", { name: nextTitle })).toBeVisible();

    await page.context().clearCookies();
    await page.goto(`/bingo/${snapshot.bingo_id}`);
    await expect(page.getByRole("heading", { name: nextTitle })).toBeVisible();
    await page.goto(sharePath);
    await expect(page.getByRole("heading", { name: snapshot.title })).toBeVisible();
    await expect(
      page.getByText(`This is a read-only snapshot from revision ${snapshot.revision_number}.`),
    ).toBeVisible();
    const oldSnapshotCell = page.locator(".play-cell").first();
    await expect(oldSnapshotCell).toBeEnabled();
    await oldSnapshotCell.click();
    await expect(page.locator(".play-cell-detail")).toContainText(
      fixture.bingos.revision.cell_texts[0]!,
    );
    await page.getByRole("link", { name: "Play this bingo" }).click();
    await expect(page.getByRole("heading", { name: nextTitle })).toBeVisible();
  });

  test("logout in another tab clears private state and editor recovery", async ({ page }) => {
    const fixture = readLiveFixture();
    await authenticateAs(page, "author");
    const secondTab = await page.context().newPage();
    await page.goto("/profile");
    await secondTab.goto("/profile");
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(secondTab.getByRole("button", { name: "Log out" })).toBeVisible();

    await page.evaluate(() => {
      window.localStorage.setItem("not-enough-bingo:editor-recovery:v1:new", "old private draft");
    });
    await secondTab.getByRole("button", { name: "Log out" }).click();
    await expect(secondTab).toHaveURL(/\/login$/);
    await expect(page).toHaveURL(/\/login\?reason=session-expired&next=%2Fprofile$/);
    await expect(
      page.getByText("Your session ended. Log in again to continue where you left off."),
    ).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem("not-enough-bingo:editor-recovery:v1:new"),
      ),
    ).toBeNull();

    await secondTab.getByLabel("Email").fill(fixture.users.player.email);
    await secondTab.getByLabel("Password").fill(E2E_FIXTURE_PASSWORD);
    await waitForResponse(secondTab, "/api/v1/auth/login/", "POST", () =>
      secondTab.getByRole("button", { name: "Log in" }).click(),
    );
    await expect(secondTab).toHaveURL(/\/discover$/);
    await expect(page.locator('a[href="/profile"]')).toBeVisible();
    await secondTab.close();
  });

  test("password reset handles an outage, email link, expired session, and token reuse", async ({
    page,
    request,
  }) => {
    const fixture = readLiveFixture();
    const email = fixture.users.player.email;
    const nextPassword = "E2E-New-Password!2026";
    await authenticateAs(page, "player");
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);

    await page.route("**/api/v1/auth/password-reset/", (route) => route.abort("failed"));
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.locator(".form-message--error")).toContainText("Unable to reach the service");
    await expect(page.getByLabel("Email")).toHaveValue(email);
    await page.unroute("**/api/v1/auth/password-reset/");

    await waitForResponse(page, "/api/v1/auth/password-reset/", "POST", () =>
      page.getByRole("button", { name: "Send reset link" }).click(),
    );
    await expect(page.getByRole("status")).toContainText("If an account exists");

    const link = new URL(await passwordResetLink(request, email));
    await page.goto(`${link.pathname}${link.search}`);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill(nextPassword);
    await waitForResponse(page, "/api/v1/auth/password-reset/confirm/", "POST", () =>
      page.getByRole("button", { name: "Update password" }).click(),
    );
    await expect(page.getByRole("status")).toContainText("Password changed");
    expect((await page.request.get("/api/v1/auth/me/")).status()).toBe(403);

    await page.reload();
    await page.getByLabel("New password", { exact: true }).fill(nextPassword);
    const repeated = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/auth/password-reset/confirm/") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Update password" }).click();
    expect((await repeated).status()).toBe(400);
    await expect(page.locator(".form-message--error")).toContainText("invalid or expired");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(E2E_FIXTURE_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.locator(".form-message--error")).toBeVisible();
    await page.getByLabel("Password").fill(nextPassword);
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      page.getByRole("button", { name: "Log in" }).click(),
    );
    await expect(page).toHaveURL(/\/discover$/);
  });

  test("email change verifies the new address and rejects a reused link", async ({
    page,
    request,
  }) => {
    const nonce = Date.now().toString(36);
    const originalEmail = `e2e-signup-email-${nonce}@example.test`;
    const username = `e2e_signup_${nonce}`;
    const password = "E2E-Email-Change!2026";
    const newEmail = `e2e-email-change-${Date.now()}@example.test`;
    await page.goto("/register");
    await page.getByLabel("Email").fill(originalEmail);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await waitForResponse(page, "/api/v1/auth/register/", "POST", () =>
      page.getByRole("button", { name: "Create account" }).click(),
    );
    const verification = new URL(await verificationLink(request, originalEmail));
    await page.goto(`${verification.pathname}${verification.search}`);
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await page.goto("/login");
    await page.getByLabel("Email").fill(originalEmail);
    await page.getByLabel("Password").fill(password);
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      page.getByRole("button", { name: "Log in" }).click(),
    );
    await page.goto("/profile");
    await page.getByLabel("New email address").fill(newEmail);
    await page.getByLabel("Current password for email change").fill("incorrect-password");
    const rejected = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/auth/email-change/") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send confirmation email" }).click();
    expect((await rejected).status()).toBe(400);
    await expect(page.locator(".form-message--error")).toContainText(
      "The current password is incorrect",
    );

    await page.getByLabel("Current password for email change").fill(password);
    await waitForResponse(page, "/api/v1/auth/email-change/", "POST", () =>
      page.getByRole("button", { name: "Send confirmation email" }).click(),
    );
    await expect(
      page.getByText("Check the new email address for a confirmation link."),
    ).toBeVisible();
    expect(
      ((await (await page.context().request.get("/api/v1/auth/me/")).json()) as { email: string })
        .email,
    ).toBe(originalEmail);

    const link = new URL(await emailChangeLink(request, newEmail));
    await page.goto(`${link.pathname}${link.search}`);
    await expect(page.getByRole("heading", { name: "Email changed" })).toBeVisible({
      timeout: 15_000,
    });
    expect(
      ((await (await page.context().request.get("/api/v1/auth/me/")).json()) as { email: string })
        .email,
    ).toBe(newEmail);
    await expect
      .poll(
        async () => {
          const response = await request.get(`${mailpitBaseURL}/api/v1/messages?limit=100`);
          if (!response.ok()) return false;
          const rows = messageRows(await response.json());
          return [originalEmail, newEmail].every((address) =>
            rows.some((row) => {
              const text = JSON.stringify(row).toLowerCase();
              return (
                text.includes(address) &&
                text.includes("your not enough bingo email address changed")
              );
            }),
          );
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    await page.reload();
    await expect(page.locator(".form-message--error")).toContainText("already been used");

    await page.goto("/profile");
    await expect(page.getByText(`Current address: ${newEmail}`)).toBeVisible();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill(newEmail);
    await page.getByLabel("Password").fill(password);
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      page.getByRole("button", { name: "Log in" }).click(),
    );
    await expect(page).toHaveURL(/\/discover$/);
  });
});
