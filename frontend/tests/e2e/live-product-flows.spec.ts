import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, BrowserContext, Page, Response, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { BingoDraft } from "@/lib/api/types";

import { largeImagePng } from "./large-image-fixture";
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
const socialFormBoards = new WeakMap<Page, string>();

test("profile remains editable when its activity list fails and recovers", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await authenticateAs(page, "author");
  const identity = await page.request.get("/api/v1/auth/me/");
  expect(identity.status()).toBe(200);
  const signedIn = (await identity.json()) as { id: string; email: string };
  expect(signedIn.id).toBe(readLiveFixture().users.author.id);
  const profileResponse = await page.request.get("/api/v1/profiles/me/");
  expect(profileResponse.status()).toBe(200);
  const savedProfile = (await profileResponse.json()) as {
    id: string;
    username: string;
    display_name: string;
    bio: string;
  };
  expect(savedProfile.id).toBe(signedIn.id);

  const activityPath = `/api/v1/profiles/${encodeURIComponent(savedProfile.username)}/bingos/`;
  const matchesActivity = (url: URL) =>
    url.pathname === activityPath &&
    url.searchParams.get("page") === "1" &&
    url.searchParams.get("status") === "draft";
  const message = "Profile activity is temporarily unavailable.";
  let releaseFailure!: () => void;
  const heldFailure = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  let captureFailure!: () => void;
  const failureCaptured = new Promise<void>((resolve) => {
    captureFailure = resolve;
  });
  let activityReads = 0;
  const unaffectedReads = { identity: 0, profile: 0 };
  page.on("request", (request) => {
    if (request.method() !== "GET") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/auth/me/") unaffectedReads.identity += 1;
    if (path === "/api/v1/profiles/me/") unaffectedReads.profile += 1;
  });
  let heldActivityHandler: Promise<void> | undefined;
  const activityRoute = async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    activityReads += 1;
    if (activityReads !== 1) return route.continue();
    heldActivityHandler = (async () => {
      captureFailure();
      await heldFailure;
      await route.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message } },
      });
    })();
    return heldActivityHandler;
  };
  await page.route(matchesActivity, activityRoute);
  try {
    await page.goto("/profile");
    const activity = page.getByRole("region", { name: "Profile activity", exact: true });
    const account = page.getByRole("region", { name: "Account settings", exact: true });
    const profileForm = page.locator("form.settings-card").filter({
      has: page.getByRole("heading", { name: "Profile details", exact: true }),
    });
    const signedInCard = account.locator(".settings-card").filter({
      has: page.getByRole("heading", { name: "Signed-in account", exact: true }),
    });
    await expect(profileForm.getByLabel("Username", { exact: true })).toHaveValue(
      savedProfile.username,
    );
    await expect(signedInCard.getByText(signedIn.email, { exact: true })).toBeVisible();
    await expect(activity.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
    await activity.getByRole("tab", { name: "Drafts", exact: true }).click();
    await failureCaptured;
    await expect(activity.getByRole("status")).toContainText("Loading profile activity");
    const displayName = "Unsubmitted profile activity draft 🎲";
    const bio = "Unsubmitted bio\nActivity errors must not discard this text.";
    const email = `partial-profile-${randomUUID()}@example.test`;
    await profileForm.getByLabel("Display name", { exact: true }).fill(displayName);
    await profileForm.getByLabel("Bio", { exact: true }).fill(bio);
    await account.getByLabel("New email address", { exact: true }).fill(email);
    releaseFailure();
    await expect(activity.getByRole("alert")).toContainText(message);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(1);

    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 989 });
      await expect(
        page.getByRole("heading", {
          name: savedProfile.display_name || savedProfile.username,
          exact: true,
        }),
      ).toBeVisible();
      await expect(profileForm.getByLabel("Display name", { exact: true })).toBeEnabled();
      await expect(profileForm.getByLabel("Display name", { exact: true })).toHaveValue(
        displayName,
      );
      await expect(profileForm.getByLabel("Bio", { exact: true })).toHaveValue(bio);
      await expect(account.getByLabel("New email address", { exact: true })).toBeEnabled();
      await expect(account.getByLabel("New email address", { exact: true })).toHaveValue(email);
      await expect(
        account.getByRole("button", { name: "Change password", exact: true }),
      ).toBeEnabled();
      await expect(
        signedInCard.getByRole("button", { name: "Log out", exact: true }),
      ).toBeEnabled();
      await expect(activity.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }

    const beforeRetry = { ...unaffectedReads };
    const recovered = await waitForResponse(page, activityPath, "GET", () =>
      activity.getByRole("button", { name: "Try again", exact: true }).click(),
    );
    expect(recovered.status()).toBe(200);
    const collection = (await recovered.json()) as {
      results: Array<{ id: string; title: string }>;
    };
    await expect(activity.getByRole("alert")).toHaveCount(0);
    await expect(activity.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
    if (collection.results.length) {
      const first = collection.results[0]!;
      const card = activity.locator(`a.bingo-card__main[href="/create?bingo=${first.id}"]`);
      await expect(
        card.getByRole("heading", { name: first.title.trim() || "Untitled bingo", exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        activity.getByRole("heading", { name: "No drafts yet", exact: true }),
      ).toBeVisible();
    }
    expect(activityReads).toBe(2);
    expect(unaffectedReads).toEqual(beforeRetry);
    await expect(profileForm.getByLabel("Display name", { exact: true })).toHaveValue(displayName);
    await expect(profileForm.getByLabel("Bio", { exact: true })).toHaveValue(bio);
    await expect(account.getByLabel("New email address", { exact: true })).toHaveValue(email);
    const unchanged = await page.request.get("/api/v1/profiles/me/");
    expect(unchanged.status()).toBe(200);
    expect((await unchanged.json()).display_name).toBe(savedProfile.display_name);
    expect(pageErrors).toEqual([]);
  } finally {
    releaseFailure();
    await heldActivityHandler;
    await page.unroute(matchesActivity, activityRoute);
  }
});

test("accepted account export status failure preserves unsaved fields and allows real recovery", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await authenticateAs(page, "author");
  const identity = await page.request.get("/api/v1/auth/me/");
  expect(identity.status()).toBe(200);
  const signedIn = (await identity.json()) as { id: string; email: string };
  expect(signedIn.id).toBe(readLiveFixture().users.author.id);
  await page.goto("/profile");
  const account = page.getByRole("region", { name: "Account settings", exact: true });
  const exportCard = account.locator(".settings-card").filter({
    has: page.getByRole("heading", { name: "Export your data", exact: true }),
  });
  const profileForm = page.locator("form.settings-card").filter({
    has: page.getByRole("heading", { name: "Profile details", exact: true }),
  });
  await expect(account.getByRole("button", { name: "Change password", exact: true })).toBeEnabled();
  await expect(account.getByText("Loading active sessions…", { exact: true })).toHaveCount(0);
  await expect(account.getByText("Loading notification preferences…", { exact: true })).toHaveCount(
    0,
  );
  const displayName = "Unsubmitted export status draft 🎲";
  const bio = "Unsaved export context\nKeep profile edits while export status fails.";
  const email = `partial-export-${randomUUID()}@example.test`;
  const unsentPassword = "Unsubmitted email password value";
  await profileForm.getByLabel("Display name", { exact: true }).fill(displayName);
  await profileForm.getByLabel("Bio", { exact: true }).fill(bio);
  await account.getByLabel("New email address", { exact: true }).fill(email);
  await account
    .getByLabel("Current password for email change", { exact: true })
    .fill(unsentPassword);

  // Create/reuse an actual accepted job to know its exact status URL before routing.
  // The subsequent real UI POST must reuse that same job; neither POST is mocked.
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const accepted = await page.request.post("/api/v1/auth/account-export/", {
    headers: { "X-CSRFToken": csrf!.value },
  });
  expect(accepted.status()).toBe(202);
  const acceptedJob = (await accepted.json()) as { job_id: string; status: string };
  expect(acceptedJob.job_id).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
  expect(["queued", "processing", "ready"]).toContain(acceptedJob.status);
  const statusPath = `/api/v1/exports/${acceptedJob.job_id}/`;
  const matchesStatus = (url: URL) => url.pathname === statusPath;
  const message = "Data export status is temporarily unavailable.";
  let statusReads = 0;
  let releaseFailure!: () => void;
  const heldFailure = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  let captureFailure!: () => void;
  const failureCaptured = new Promise<void>((resolve) => {
    captureFailure = resolve;
  });
  let heldStatusHandler: Promise<void> | undefined;
  const statusRoute = async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    statusReads += 1;
    if (statusReads !== 1) return route.continue();
    heldStatusHandler = (async () => {
      captureFailure();
      await heldFailure;
      await route.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message } },
      });
    })();
    return heldStatusHandler;
  };
  await page.route(matchesStatus, statusRoute);
  try {
    const requested = await waitForResponse(page, "/api/v1/auth/account-export/", "POST", () =>
      exportCard.getByRole("button", { name: "Request data export", exact: true }).click(),
    );
    expect(requested.status()).toBe(202);
    expect((await requested.json()).job_id).toBe(acceptedJob.job_id);
    await failureCaptured;
    await expect(
      exportCard.getByRole("button", { name: "Preparing export…", exact: true }),
    ).toBeDisabled();
    await expect(profileForm.getByLabel("Display name", { exact: true })).toBeEnabled();
    await expect(profileForm.getByLabel("Display name", { exact: true })).toHaveValue(displayName);
    releaseFailure();
    await expect(exportCard.getByRole("alert")).toContainText(message);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(1);
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 989 });
      await expect(profileForm.getByLabel("Display name", { exact: true })).toBeEnabled();
      await expect(profileForm.getByLabel("Display name", { exact: true })).toHaveValue(
        displayName,
      );
      await expect(profileForm.getByLabel("Bio", { exact: true })).toHaveValue(bio);
      await expect(account.getByLabel("New email address", { exact: true })).toBeEnabled();
      await expect(account.getByLabel("New email address", { exact: true })).toHaveValue(email);
      await expect(
        account.getByLabel("Current password for email change", { exact: true }),
      ).toHaveValue(unsentPassword);
      await expect(
        account.getByRole("button", { name: "Change password", exact: true }),
      ).toBeEnabled();
      await expect(account.getByRole("button", { name: "Log out", exact: true })).toBeEnabled();
      await expect(
        exportCard.getByRole("button", { name: "Request data export", exact: true }),
      ).toBeEnabled();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }

    const realStatus = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === statusPath &&
        response.request().method() === "GET" &&
        response.status() === 200,
    );
    const retried = await waitForResponse(page, "/api/v1/auth/account-export/", "POST", () =>
      exportCard.getByRole("button", { name: "Request data export", exact: true }).click(),
    );
    expect(retried.status()).toBe(202);
    expect((await retried.json()).job_id).toBe(acceptedJob.job_id);
    const recoveredStatus = await realStatus;
    expect((await recoveredStatus.json()).id).toBe(acceptedJob.job_id);
    await expect(
      exportCard.getByRole("link", { name: "Download data export", exact: true }),
    ).toBeVisible({ timeout: 45_000 });
    await expect(exportCard.getByRole("status")).toHaveText(
      "Your data export is ready to download.",
    );
    await expect(exportCard.getByRole("alert")).toHaveCount(0);
    expect(statusReads).toBeGreaterThanOrEqual(2);
    await expect(profileForm.getByLabel("Display name", { exact: true })).toHaveValue(displayName);
    await expect(profileForm.getByLabel("Bio", { exact: true })).toHaveValue(bio);
    await expect(account.getByLabel("New email address", { exact: true })).toHaveValue(email);
    await expect(
      account.getByLabel("Current password for email change", { exact: true }),
    ).toHaveValue(unsentPassword);
    const stillSignedIn = await page.request.get("/api/v1/auth/me/");
    expect(stillSignedIn.status()).toBe(200);
    expect((await stillSignedIn.json()).id).toBe(signedIn.id);
    expect(pageErrors).toEqual([]);
  } finally {
    releaseFailure();
    await heldStatusHandler;
    await page.unroute(matchesStatus, statusRoute);
  }
});

test("catalog stays usable when suggestions and unread counts fail", async ({ page }) => {
  const fixture = readLiveFixture();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  await authenticateAs(page, "player");
  const failures = { authors: 0, tags: 0, unread: 0 };
  for (const [resource, path] of [
    ["authors", "authors/"],
    ["tags", "tags/"],
    ["unread", "notifications/unread-count/"],
  ] as const) {
    await page.route(`**/api/v1/${path}**`, async (route) => {
      failures[resource] += 1;
      await route.fulfill({ status: 503, json: { detail: "Temporarily unavailable." } });
    });
  }
  await page.goto("/explore");
  await page.getByLabel("Search by title", { exact: true }).fill(fixture.bingos.public.title);
  await page.getByLabel("Author", { exact: true }).fill(fixture.users.author.username);
  await page.getByLabel("Tags", { exact: true }).fill("e2e, public");
  await expect
    .poll(() => failures.authors > 0 && failures.tags > 0 && failures.unread > 0)
    .toBe(true);
  await page.getByLabel("Search by title", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/explore\?search=/);
  await expect(page).toHaveTitle(/Explore/);
  await expect(page.locator("#main-content")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".bingo-grid")).toContainText(fixture.bingos.public.title);
  await expect(page.locator("datalist option")).toHaveCount(0);
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    await expect(page.getByLabel("Search by title", { exact: true })).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("player protects saved marks during progress outage and loads without author details", async ({
  page,
}) => {
  const board = await createSocialFormBoard(page);
  const fixture = readLiveFixture();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  await authenticateAs(page, "player");
  const progressPath = `/api/v1/progress/${board.id}/`;
  await page.goto(`/bingo/${board.id}`);
  const cells = page.locator("button.play-cell");
  await expect(cells.first()).toBeEnabled();
  await cells.first().click();
  async function savedMarks() {
    const response = await page.context().request.get(progressPath);
    expect(response.status()).toBe(200);
    return ((await response.json()) as { selected_cells: string[] }).selected_cells;
  }
  await expect.poll(async () => (await savedMarks()).length).toBe(1);
  const originalMarks = await savedMarks();
  let authorRequests = 0;
  let commentFailures = 0;
  let progressWrites = 0;
  let releaseAuthor!: () => void;
  const authorHeld = new Promise<void>((resolve) => {
    releaseAuthor = resolve;
  });
  page.on("request", (request) => {
    if (request.url().endsWith(progressPath) && request.method() === "PUT") progressWrites += 1;
  });
  await page.route(`**/api/v1/profiles/${fixture.users.author.username}/`, async (route) => {
    authorRequests += 1;
    await authorHeld;
    await route.continue();
  });
  await page.route(`**/api/v1/bingos/${board.id}/comments/**`, async (route) => {
    commentFailures += 1;
    await route.fulfill({ status: 503, json: { detail: "Comments are temporarily unavailable." } });
  });
  await page.route(`**${progressPath}`, async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 503,
        json: { detail: "Progress is temporarily unavailable." },
      });
    } else await route.continue();
  });
  try {
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Retry loading progress", exact: true }),
    ).toBeVisible();
    await expect(cells.first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Share result", exact: true })).toBeDisabled();
    await cells.first().evaluate((node: HTMLButtonElement) => node.click());
    expect(await savedMarks()).toEqual(originalMarks);
    expect(progressWrites).toBe(0);
    await page.unroute(`**${progressPath}`);
    await page.getByRole("button", { name: "Retry loading progress", exact: true }).click();
    await expect(cells.first()).toBeEnabled();
    await expect(cells.first()).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => authorRequests > 0 && commentFailures > 0).toBe(true);
    await expect(page.locator(".comments-panel [role=alert]")).toBeVisible();
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 989 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    expect(progressWrites).toBe(0);
    await cells.nth(1).click();
    await expect.poll(async () => (await savedMarks()).length).toBe(2);
    expect(pageErrors).toEqual([]);
  } finally {
    releaseAuthor();
  }
});

test("departed editor does not redirect or continue saving after draft creation", async ({
  page,
}) => {
  await authenticateAs(page, "author");
  let releaseCreation!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseCreation = resolve;
  });
  let createdId = "";
  let updates = 0;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/api/v1/bingos/")) updates += 1;
  });
  await page.route("**/api/v1/drafts/", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    const draft = (await response.json()) as { bingo_id: string };
    createdId = draft.bingo_id;
    socialFormBoards.set(page, createdId);
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/create");
    await page.getByRole("button", { name: "Increase bingo size", exact: true }).click();
    await expect.poll(() => Boolean(createdId)).toBe(true);
    await page.getByRole("button", { name: "Increase bingo size", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/drafts/") && response.request().method() === "POST",
    );
    releaseCreation();
    await response;
    // Observe beyond the autosave debounce: an old save loop must not send another write.
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/explore$/);
    expect(updates).toBe(0);
    const persisted = await page.context().request.get(`/api/v1/bingos/${createdId}/draft/`);
    expect(persisted.status()).toBe(200);
    expect((await persisted.json()).size).toBe(6);
    expect(pageErrors).toEqual([]);
  } finally {
    releaseCreation();
  }
});

test("departed editor does not navigate after publication completes", async ({ page }) => {
  const board = await createSocialFormBoard(page);
  let releasePublication!: () => void;
  const held = new Promise<void>((resolve) => {
    releasePublication = resolve;
  });
  let published = false;
  const path = `/api/v1/bingos/${board.id}/publish/`;
  await page.route(`**${path}`, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    published = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.goto(`/create?bingo=${board.id}`);
    await page.getByRole("button", { name: "Finish creating →", exact: true }).click();
    await page.getByRole("button", { name: "Publish bingo", exact: true }).click();
    await expect.poll(() => published).toBe(true);
    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
    const response = page.waitForResponse(
      (response) => response.url().endsWith(path) && response.request().method() === "POST",
    );
    releasePublication();
    await response;
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
  } finally {
    releasePublication();
  }
});

test("create navigation opens a separate blank board from an existing draft", async ({ page }) => {
  const board = await createSocialFormBoard(page);
  await page.goto(`/create?bingo=${board.id}`);
  await expect(page.getByRole("heading", { name: "Edit bingo", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByRole("heading", { name: "Create bingo", exact: true })).toBeVisible();
  await expect(page.getByText("5 × 5", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish creating →", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
  const unchanged = await page.context().request.get(`/api/v1/bingos/${board.id}/draft/`);
  expect(unchanged.status()).toBe(200);
  expect((await unchanged.json()).size).toBe(3);
});

for (const boundary of ["leave", "cross-tab logout"] as const) {
  test(`player does not send queued marks after ${boundary}`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));
    const board = await createSocialFormBoard(page);
    if (boundary === "leave") await authenticateAs(page, "player");
    else {
      // Use a separate session so logout does not revoke the shared fixture session.
      await page.context().clearCookies();
      expect((await page.context().request.get("/api/v1/auth/csrf/")).status()).toBe(200);
      const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
      expect(csrf).toBeDefined();
      const login = await page.context().request.post("/api/v1/auth/login/", {
        headers: { "X-CSRFToken": csrf!.value },
        data: { email: readLiveFixture().users.player.email, password: E2E_FIXTURE_PASSWORD },
      });
      expect(login.status()).toBe(200);
    }
    let releaseSave!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let persisted = false;
    let writes = 0;
    const progressPath = `/api/v1/progress/${board.id}/`;
    await page.route(`**${progressPath}`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      writes += 1;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      persisted = true;
      await held;
      await route.fulfill({ response });
    });
    const otherTab = boundary === "cross-tab logout" ? await page.context().newPage() : null;
    try {
      if (otherTab) {
        await otherTab.goto("/profile");
        await expect(otherTab.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
      }
      await page.goto(`/bingo/${board.id}`);
      const cells = page.locator("button.play-cell");
      await expect(cells.first()).toBeEnabled();
      await cells.first().click();
      await expect.poll(() => persisted).toBe(true);
      await cells.nth(1).click();
      // Let the second autosave join the chain behind the held first response.
      await page.waitForTimeout(450);
      expect(writes).toBe(1);
      if (otherTab) {
        await otherTab.getByRole("button", { name: "Log out", exact: true }).click();
        await expect(page.getByRole("link", { name: "Log in to like", exact: true })).toBeVisible();
      } else {
        await page.getByRole("link", { name: "Explore", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
      }
      const response = page.waitForResponse(
        (response) =>
          response.url().endsWith(progressPath) && response.request().method() === "PUT",
      );
      releaseSave();
      await response;
      await page.waitForTimeout(500);
      expect(writes).toBe(1);
      await authenticateAs(page, "player");
      const progress = await page.context().request.get(progressPath);
      expect(progress.status()).toBe(200);
      expect((await progress.json()).selected_cells).toHaveLength(1);
      expect(pageErrors).toEqual([]);
    } finally {
      releaseSave();
      await otherTab?.close();
    }
  });
}

test("first draft save updates its URL without a server navigation", async ({ page }) => {
  await authenticateAs(page, "author");
  let serverNavigations = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      url.pathname === "/create" &&
      url.searchParams.has("bingo") &&
      request.headers()["rsc"] === "1"
    )
      serverNavigations += 1;
  });
  await page.goto("/create");
  await page.getByRole("gridcell").first().click();
  await page
    .getByRole("textbox", { name: "Text for row 1, column 1", exact: true })
    .fill("Save without server navigation");
  await expect(page).toHaveURL(/\/create\?bingo=[0-9a-f-]+$/);
  const id = new URL(page.url()).searchParams.get("bingo")!;
  socialFormBoards.set(page, id);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(
      page.getByRole("textbox", { name: "Text for row 1, column 1", exact: true }),
    ).toHaveValue("Save without server navigation");
  }
  await page.waitForTimeout(500);
  expect(serverNavigations).toBe(0);
  const persisted = await page.context().request.get(`/api/v1/bingos/${id}/draft/`);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).cells[0].text).toBe("Save without server navigation");
  await page.reload();
  await expect(
    page.getByRole("gridcell", { name: /Save without server navigation/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.getByRole("heading", { name: "Create bingo", exact: true })).toBeVisible();
  await expect(page.getByRole("gridcell").first()).not.toContainText(
    "Save without server navigation",
  );
});

for (const outcome of ["success", "authentication failure"] as const) {
  test(`departed card ignores a delayed like ${outcome} and prevents duplicate writes`, async ({
    page,
  }) => {
    const board = await createSocialFormBoard(page);
    const path = `/api/v1/bingos/${board.id}/likes/`;
    let writes = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));
    await page.route(`**${path}`, async (route) => {
      writes += 1;
      if (outcome === "success") {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        await held;
        await route.fulfill({ response });
      } else {
        await held;
        await route.fulfill({
          status: 403,
          json: { error: { code: "not_authenticated", message: "Login required." } },
        });
      }
    });
    try {
      await page.goto("/profile");
      await page.getByRole("tab", { name: "Created", exact: true }).click();
      const card = page
        .locator(".bingo-card")
        .filter({ has: page.locator(`a.bingo-card__main[href="/bingo/${board.id}"]`) });
      const like = card.getByRole("button", { name: /^Like / });
      await expect(like).toBeEnabled();
      await like.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
      await expect.poll(() => writes).toBe(1);
      await page.getByRole("link", { name: "Explore", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
      const response = page.waitForResponse((response) => response.url().endsWith(path));
      release();
      await response;
      await page.waitForTimeout(500);
      expect(writes).toBe(1);
      await expect(page).toHaveURL(/\/explore$/);
      const saved = await page.context().request.get(`/api/v1/bingos/${board.id}/`);
      expect(saved.status()).toBe(200);
      expect((await saved.json()).stats.likes).toBe(outcome === "success" ? 1 : 0);
      expect(pageErrors).toEqual([]);
    } finally {
      release();
    }
  });
}

for (const boundary of ["leave", "cross-tab logout"] as const) {
  test(`notifications ignore a delayed mark-all error after ${boundary} and prevent duplicate writes`, async ({
    page,
    playwright,
  }) => {
    const board = await createSocialFormBoard(page);
    await authenticateAs(page, "player");
    const playerCsrf = (await page.context().cookies()).find(
      (cookie) => cookie.name === "neb_csrf",
    );
    expect(playerCsrf).toBeDefined();
    expect(
      (
        await page.context().request.post(`/api/v1/bingos/${board.id}/likes/`, {
          headers: { "X-CSRFToken": playerCsrf!.value },
        })
      ).status(),
    ).toBe(201);
    if (boundary === "leave") await authenticateAs(page, "author");
    else {
      await page.context().clearCookies();
      expect((await page.context().request.get("/api/v1/auth/csrf/")).status()).toBe(200);
      const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
      expect(
        (
          await page.context().request.post("/api/v1/auth/login/", {
            headers: { "X-CSRFToken": csrf!.value },
            data: { email: readLiveFixture().users.author.email, password: E2E_FIXTURE_PASSWORD },
          })
        ).status(),
      ).toBe(200);
    }
    const path = "/api/v1/notifications/read-all/";
    let writes = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));
    await page.route(`**${path}`, async (route) => {
      writes += 1;
      await held;
      await route.fulfill({ status: 503, json: { detail: "Delayed notification failure." } });
    });
    const otherTab = boundary === "cross-tab logout" ? await page.context().newPage() : null;
    const authorApi = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
      storageState: authStatePath("author"),
    });
    try {
      if (otherTab) {
        await otherTab.goto("/profile");
        await expect(otherTab.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
      }
      await page.goto("/notifications");
      const markAll = page.getByRole("button", { name: "Mark all as read", exact: true });
      await expect(markAll).toBeEnabled();
      const notification = page.locator(`.notification-list a[href="/bingo/${board.id}"]`).first();
      await expect(notification).toBeVisible();
      for (const width of [320, 1710]) {
        await page.setViewportSize({ width, height: 989 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
      await markAll.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
      await expect.poll(() => writes).toBe(1);
      if (otherTab) {
        await otherTab.getByRole("button", { name: "Log out", exact: true }).click();
        await expect(page.getByText("Log in to view notifications", { exact: true })).toBeVisible();
        await expect(page.locator(".notification-list")).toHaveCount(0);
      } else {
        await page.getByRole("link", { name: "Explore", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
      }
      const response = page.waitForResponse((response) => response.url().endsWith(path));
      release();
      await response;
      await page.waitForTimeout(500);
      expect(writes).toBe(1);
      await expect(
        page.getByRole("alert").filter({ hasText: "Delayed notification failure." }),
      ).toHaveCount(0);
      if (otherTab)
        await expect(page.getByText("Log in to view notifications", { exact: true })).toBeVisible();
      else await expect(page).toHaveURL(/\/explore$/);
      const saved = await authorApi.get("/api/v1/notifications/");
      expect(saved.status()).toBe(200);
      const own = (await saved.json()).results.find(
        (item: { target_url: string }) => item.target_url === `/bingo/${board.id}`,
      );
      expect(own).toBeDefined();
      expect(own.read_at).toBeNull();
      expect(pageErrors).toEqual([]);
    } finally {
      release();
      await otherTab?.close();
      await authorApi.dispose();
    }
  });
}

for (const action of ["copy", "native share"] as const) {
  test(`shared-result ${action} gives pending feedback, prevents duplicates and recovers`, async ({
    page,
  }) => {
    const snapshot = readLiveFixture().revision_snapshot;
    const path = `/share/${snapshot.bingo_id}/${snapshot.share_id}`;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));
    await page.addInitScript((action) => {
      const state: { calls: number; resolve: () => void; reject: (error: unknown) => void } = {
        calls: 0,
        resolve: () => {},
        reject: () => {},
      };
      Object.assign(window, { nebShareAction: state });
      const operation = () => {
        state.calls += 1;
        return new Promise<void>((resolve, reject) => {
          state.resolve = resolve;
          state.reject = reject;
        });
      };
      if (action === "copy")
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: operation },
        });
      else Object.defineProperty(navigator, "share", { configurable: true, value: operation });
    }, action);
    await page.goto(path);
    await expect(page.getByRole("heading", { name: snapshot.title, exact: true })).toBeVisible();
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 989 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    const button = page.getByRole("button", {
      name: action === "copy" ? "Copy link" : "Share",
      exact: true,
    });
    await button.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.locator(".share-status")).toHaveText(
      action === "copy" ? "Copying link…" : "Sharing…",
    );
    await expect(page.getByRole("button", { name: "Copy link", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Share", exact: true })).toBeDisabled();
    expect(
      await page.evaluate(
        () => (window as unknown as { nebShareAction: { calls: number } }).nebShareAction.calls,
      ),
    ).toBe(1);
    await page.evaluate((action) => {
      (
        window as unknown as { nebShareAction: { reject: (error: unknown) => void } }
      ).nebShareAction.reject(
        new DOMException(
          "Test browser action failure",
          action === "copy" ? "NotAllowedError" : "AbortError",
        ),
      );
    }, action);
    await expect(button).toBeEnabled();
    await expect(page.locator(".share-status")).toHaveText(
      action === "copy" ? "Copy failed. Select the address from your browser to share it." : "",
    );
    await button.click();
    await expect(page.locator(".share-status")).toHaveText(
      action === "copy" ? "Copying link…" : "Sharing…",
    );
    await page.getByRole("link", { name: "Play this bingo", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/bingo/${snapshot.bingo_id}$`));
    await expect(page.locator("button.play-cell").first()).toBeEnabled();
    await page.evaluate(() =>
      (window as unknown as { nebShareAction: { resolve: () => void } }).nebShareAction.resolve(),
    );
    await page.waitForTimeout(200);
    await expect(
      page.getByText(action === "copy" ? "Link copied." : "Shared.", { exact: true }),
    ).toHaveCount(0);
    await page.goto(path);
    await expect(button).toBeEnabled();
    await button.click();
    await page.evaluate(() =>
      (window as unknown as { nebShareAction: { resolve: () => void } }).nebShareAction.resolve(),
    );
    await expect(page.locator(".share-status")).toHaveText(
      action === "copy" ? "Link copied." : "Shared.",
    );
    await expect(button).toBeEnabled();
    expect(pageErrors).toEqual([]);
  });
}

test("public profile retries viewer identity without losing its content", async ({ page }) => {
  const fixture = readLiveFixture();
  await authenticateAs(page, "player");
  let unavailable = true;
  let profileReads = 0;
  let identityReads = 0;
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  await page.route(`**/api/v1/profiles/${fixture.users.author.username}/`, async (route) => {
    profileReads += 1;
    await route.continue();
  });
  await page.route("**/api/v1/auth/session/", async (route) => {
    identityReads += 1;
    if (unavailable)
      return route.fulfill({
        status: 503,
        json: { detail: "Account details are temporarily unavailable." },
      });
    return route.continue();
  });
  await page.goto(`/profile/${fixture.users.author.username}`);
  await expect(
    page.getByRole("heading", { name: fixture.users.author.display_name, exact: true }),
  ).toBeVisible();
  const viewerState = page.locator(".profile-viewer-state");
  await expect(viewerState.getByRole("alert")).toContainText(
    "Account details are temporarily unavailable.",
  );
  await expect(page.getByRole("button", { name: "Follow", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Report profile", exact: true })).toHaveCount(0);
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(viewerState.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const before = { profileReads, identityReads };
  unavailable = false;
  await viewerState.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^(Follow|Following)$/, exact: true }),
  ).toBeEnabled();
  expect(profileReads).toBe(before.profileReads);
  expect(identityReads).toBe(before.identityReads + 1);
  await expect(viewerState).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

for (const outcome of ["success", "failure"] as const) {
  test(`departed profile ignores a delayed save ${outcome}`, async ({ page, playwright }) => {
    await authenticateAs(page, "author");
    const authorApi = await playwright.request.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
      storageState: authStatePath("author"),
    });
    const originalResponse = await authorApi.get("/api/v1/profiles/me/");
    expect(originalResponse.status()).toBe(200);
    const original = await originalResponse.json();
    const csrf = (await authorApi.storageState()).cookies.find(
      (cookie) => cookie.name === "neb_csrf",
    );
    expect(csrf).toBeDefined();
    const headers = { "X-CSRFToken": csrf!.value };
    const editedName = "Pending profile QA name";
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    let accepted = false;
    const path = "/api/v1/profiles/me/";
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));
    page.on("dialog", (dialog) => void dialog.accept());
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      writes += 1;
      if (outcome === "success") {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        accepted = true;
        await held;
        await route.fulfill({ response });
      } else {
        accepted = true;
        await held;
        await route.fulfill({ status: 503, json: { detail: "Delayed profile save failed." } });
      }
    });
    try {
      await page.goto("/profile");
      await page.getByLabel("Display name", { exact: true }).fill(editedName);
      await page
        .getByRole("button", { name: "Save profile", exact: true })
        .evaluate((button: HTMLButtonElement) => {
          button.click();
          button.click();
        });
      await expect.poll(() => accepted).toBe(true);
      expect(writes).toBe(1);
      await page.getByRole("link", { name: "Explore", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
      const response = page.waitForResponse(
        (response) => response.url().endsWith(path) && response.request().method() === "PATCH",
      );
      release();
      await response;
      await page.waitForTimeout(300);
      await expect(page).toHaveURL(/\/explore$/);
      await expect(page.getByText("Profile saved.", { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole("alert").filter({ hasText: "Delayed profile save failed." }),
      ).toHaveCount(0);
      const saved = await authorApi.get(path);
      expect(saved.status()).toBe(200);
      expect((await saved.json()).display_name).toBe(
        outcome === "success" ? editedName : original.display_name,
      );
      expect(writes).toBe(1);
      expect(pageErrors).toEqual([]);
    } finally {
      release();
      expect(
        (
          await authorApi.patch(path, { headers, data: { display_name: original.display_name } })
        ).status(),
      ).toBe(200);
      await authorApi.dispose();
    }
  });
}

for (const action of ["avatar", "export"] as const) {
  test(`departed account settings ignore a delayed ${action} success`, async ({
    page,
    playwright,
  }) => {
    await authenticateAs(page, "author");
    const authorApi = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: authStatePath("author"),
    });
    const originalResponse = await authorApi.get("/api/v1/profiles/me/");
    expect(originalResponse.status()).toBe(200);
    const original = await originalResponse.json();
    const csrf = (await authorApi.storageState()).cookies.find(
      (cookie) => cookie.name === "neb_csrf",
    );
    expect(csrf).toBeDefined();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let accepted = false;
    let writes = 0;
    let exportReads = 0;
    let changedAvatarId: string | undefined;
    let exportId: string | undefined;
    const path = action === "avatar" ? "/api/v1/profiles/me/" : "/api/v1/auth/account-export/";
    const method = action === "avatar" ? "PATCH" : "POST";
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.name));
    await page.route("**/api/v1/exports/**", (route) => {
      if (route.request().method() === "GET") exportReads += 1;
      return route.continue();
    });
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== method) return route.continue();
      writes += 1;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const value = await response.json();
      if (action === "avatar") changedAvatarId = value.avatar?.id;
      else exportId = value.job_id;
      accepted = true;
      await held;
      await route.fulfill({ response });
    });
    try {
      await page.goto("/profile");
      await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
      for (const width of [320, 1710]) {
        await page.setViewportSize({ width, height: 989 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      }
      if (action === "avatar") {
        await page
          .getByLabel("Upload avatar", { exact: true })
          .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: cellImagePng });
      } else {
        await page
          .getByRole("button", { name: "Request data export", exact: true })
          .evaluate((button: HTMLButtonElement) => {
            button.click();
            button.click();
          });
      }
      await expect.poll(() => accepted).toBe(true);
      expect(writes).toBe(1);
      await page.getByRole("link", { name: "Explore", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
      const delivered = page.waitForResponse(
        (response) => response.url().endsWith(path) && response.request().method() === method,
      );
      release();
      await (await delivered).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page).toHaveURL(/\/explore$/);
      await expect(page.getByText("Avatar updated.", { exact: true })).toHaveCount(0);
      expect(exportReads).toBe(0);
      if (action === "avatar") {
        expect(changedAvatarId).toBeDefined();
        const saved = await authorApi.get("/api/v1/profiles/me/");
        expect(saved.status()).toBe(200);
        expect((await saved.json()).avatar?.id).toBe(changedAvatarId);
      } else {
        expect(exportId).toBeDefined();
        expect((await authorApi.get(`/api/v1/exports/${exportId}/`)).status()).toBe(200);
      }
      expect(writes).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      release();
      if (action === "avatar") {
        expect(
          (
            await authorApi.patch("/api/v1/profiles/me/", {
              headers: { "X-CSRFToken": csrf!.value },
              data: { avatar_id: original.avatar?.id ?? null },
            })
          ).status(),
        ).toBe(200);
      }
      await authorApi.dispose();
    }
  });
}

for (const outcome of ["success", "failure"] as const) {
  test(`departed player ignores a delayed author follow ${outcome}`, async ({
    page,
    playwright,
  }) => {
    const board = await createSocialFormBoard(page);
    await authenticateAs(page, "player");
    const fixture = readLiveFixture();
    const playerApi = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: authStatePath("player"),
    });
    const originalResponse = await playerApi.get(
      `/api/v1/profiles/${fixture.users.author.username}/`,
    );
    expect(originalResponse.status()).toBe(200);
    const original = await originalResponse.json();
    const csrf = (await playerApi.storageState()).cookies.find(
      (cookie) => cookie.name === "neb_csrf",
    );
    expect(csrf).toBeDefined();
    const path = `/api/v1/users/${fixture.users.author.id}/followers/`;
    const method = original.is_following ? "DELETE" : "POST";
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let accepted = false;
    let writes = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.name));
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== method) return route.continue();
      writes += 1;
      if (outcome === "success") {
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        accepted = true;
        await held;
        await route.fulfill({ response });
      } else {
        accepted = true;
        await held;
        await route.fulfill({ status: 503, json: { detail: "Delayed author follow failed." } });
      }
    });
    try {
      await page.goto(`/bingo/${board.id}`);
      const follow = page.getByRole("button", {
        name: original.is_following ? "Following" : "Follow author",
        exact: true,
      });
      await expect(follow).toBeEnabled();
      await follow.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
      await expect.poll(() => accepted).toBe(true);
      expect(writes).toBe(1);
      await expect(follow).toBeDisabled();
      await page.getByRole("link", { name: "Explore", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
      const delivered = page.waitForResponse(
        (response) => response.url().endsWith(path) && response.request().method() === method,
      );
      release();
      await (await delivered).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(page).toHaveURL(/\/explore$/);
      await expect(page.getByText("Delayed author follow failed.", { exact: true })).toHaveCount(0);
      const saved = await playerApi.get(`/api/v1/profiles/${fixture.users.author.username}/`);
      expect(saved.status()).toBe(200);
      expect((await saved.json()).is_following).toBe(
        outcome === "success" ? !original.is_following : original.is_following,
      );
      expect(writes).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      release();
      const restored = original.is_following
        ? await playerApi.post(path, { headers: { "X-CSRFToken": csrf!.value } })
        : await playerApi.delete(path, { headers: { "X-CSRFToken": csrf!.value } });
      expect(restored.ok()).toBe(true);
      await playerApi.dispose();
    }
  });
}

test("departed player ignores a delayed archive success", async ({ page, playwright }) => {
  const board = await createSocialFormBoard(page);
  const authorApi = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authStatePath("author"),
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let accepted = false;
  let writes = 0;
  const path = `/api/v1/bingos/${board.id}/archive/`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    writes += 1;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    accepted = true;
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.goto(`/bingo/${board.id}`);
    const archive = page.getByRole("button", { name: "Archive", exact: true });
    await expect(archive).toBeEnabled();
    await archive.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect.poll(() => accepted).toBe(true);
    expect(writes).toBe(1);
    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
    const delivered = page.waitForResponse((response) => response.url().endsWith(path));
    release();
    await (await delivered).finished();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(page).toHaveURL(/\/explore$/);
    await expect(
      page.getByText("This bingo is archived and shown read-only to its author.", { exact: true }),
    ).toHaveCount(0);
    const saved = await authorApi.get(`/api/v1/bingos/${board.id}/`);
    expect(saved.status()).toBe(200);
    expect((await saved.json()).status).toBe("archived");
    expect(writes).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    release();
    await authorApi.dispose();
  }
});

test.afterEach(async ({ page, playwright }) => {
  const id = socialFormBoards.get(page);
  if (!id) return;
  const author = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authStatePath("author"),
  });
  try {
    const csrf = (await author.storageState()).cookies.find((cookie) => cookie.name === "neb_csrf");
    expect(csrf).toBeDefined();
    const removed = await author.delete(`/api/v1/bingos/${id}/`, {
      headers: { "X-CSRFToken": csrf!.value },
    });
    expect(removed.status()).toBe(204);
    socialFormBoards.delete(page);
  } finally {
    await author.dispose();
  }
});

for (const scenario of [
  {
    path: "auth/sessions/",
    heading: "Active sessions",
    message: "Session details are temporarily unavailable.",
  },
  {
    path: "profiles/notification-preferences/",
    heading: "Notification preferences",
    message: "Notification preferences are temporarily unavailable.",
  },
]) {
  test(`account settings remain usable when ${scenario.heading.toLowerCase()} fail`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));
    await authenticateAs(page, "author");
    let unavailable = true;
    let failedRequests = 0;
    const requests = { identity: 0, sessions: 0, preferences: 0 };
    for (const [key, path] of Object.entries({
      identity: "auth/me/",
      sessions: "auth/sessions/",
      preferences: "profiles/notification-preferences/",
    })) {
      await page.route(`**/api/v1/${path}`, (route) => {
        if (route.request().method() !== "GET") return route.continue();
        requests[key as keyof typeof requests] += 1;
        if (path === scenario.path && unavailable) {
          failedRequests += 1;
          return route.fulfill({
            status: 503,
            json: { error: { code: "unavailable", message: scenario.message } },
          });
        }
        return route.continue();
      });
    }
    await page.goto("/profile");
    const section = page
      .locator(".settings-card")
      .filter({ has: page.getByRole("heading", { name: scenario.heading, exact: true }) });
    await expect(section.getByRole("alert")).toContainText(scenario.message);
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 989 });
      await expect(
        page.getByRole("button", { name: "Change password", exact: true }),
      ).toBeEnabled();
      await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeEnabled();
      await expect(page.getByLabel("Display name", { exact: true })).toBeEnabled();
      await expect(section.getByRole("button", { name: "Try again" })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const beforeRetry = { ...requests };
    unavailable = false;
    await section.getByRole("button", { name: "Try again" }).click();
    await expect(section.getByRole("alert")).toHaveCount(0);
    if (scenario.path === "auth/sessions/") {
      await expect(section.getByText("This device", { exact: true })).toBeVisible();
      expect(requests.sessions).toBe(beforeRetry.sessions + 1);
      expect(requests.preferences).toBe(beforeRetry.preferences);
    } else {
      await expect(section.getByLabel("Optional product email")).toBeVisible();
      expect(requests.preferences).toBe(beforeRetry.preferences + 1);
      expect(requests.sessions).toBe(beforeRetry.sessions);
    }
    expect(requests.identity).toBe(beforeRetry.identity);
    expect(failedRequests).toBe(
      beforeRetry[scenario.path === "auth/sessions/" ? "sessions" : "preferences"],
    );
    expect(pageErrors).toEqual([]);
  });
}

test("unsent comment text survives cancelled navigation and cannot change during posting", async ({
  page,
}) => {
  const bingo = await createSocialFormBoard(page);
  await authenticateAs(page, "player");
  await page.goto(`/bingo/${bingo.id}`);
  const body = page.getByLabel("Add a comment", { exact: true });
  const text = "Comment draft 🎲\nSecond line <literal> & useful context";
  await body.fill(text);
  const warnings: string[] = [];
  page.on("dialog", async (dialog) => {
    warnings.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  await expect(body).toHaveValue(text);
  expect(warnings).toEqual([expect.stringContaining("unsent comment")]);

  let release: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/v1/bingos/${bingo.id}/comments/`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await hold;
    await route.continue();
  });
  const posted = page.waitForResponse(
    (response) =>
      response.url().includes(`/bingos/${bingo.id}/comments/`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  try {
    await expect(body).toBeDisabled();
    await expect(page.getByRole("button", { name: "Posting…", exact: true })).toBeDisabled();
  } finally {
    release();
  }
  expect((await posted).status()).toBe(201);
  await expect(body).toHaveValue("");
  await expect(body).toBeEnabled();
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  expect(warnings).toHaveLength(1);
});

test("editor keeps a draft usable when published downloads cannot be checked", async ({ page }) => {
  const board = await createSocialFormBoard(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  let unavailable = true;
  let draftReads = 0;
  await page.route(`**/api/v1/bingos/${board.id}/draft/`, (route) => {
    if (route.request().method() === "GET") draftReads += 1;
    return route.continue();
  });
  await page.route(`**/api/v1/bingos/${board.id}/`, (route) => {
    if (unavailable && route.request().method() === "GET") {
      return route.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message: "Downloads are temporarily unavailable." } },
      });
    }
    return route.continue();
  });
  await page.goto(`/create?bingo=${board.id}`);
  await expect(page.getByRole("heading", { name: "Edit bingo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish creating →" }).click();
  const title = page.getByLabel("Title", { exact: true });
  const text = "Draft remains editable 🎲";
  await title.fill(text);
  await expect(page.locator(".details-panel").getByRole("alert")).toContainText(
    "Your draft is still editable.",
  );
  await expect(page.getByText("Download after publishing", { exact: true })).toHaveCount(0);
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    await expect(title).toHaveValue(text);
    await expect(title).toBeEnabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const readsBeforeRetry = draftReads;
  unavailable = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Download published version", { exact: true })).toBeVisible();
  await expect(title).toHaveValue(text);
  expect(draftReads).toBe(readsBeforeRetry);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const saved = await page.context().request.get(`/api/v1/bingos/${board.id}/draft/`);
  expect(saved.ok()).toBe(true);
  expect((await saved.json()).title).toBe(text);
  expect(pageErrors).toEqual([]);
});

test("editor retries a failed draft load without rendering another board", async ({ page }) => {
  const board = await createSocialFormBoard(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  let unavailable = true;
  let metadataReads = 0;
  await page.route(`**/api/v1/bingos/${board.id}/draft/`, (route) => {
    if (unavailable && route.request().method() === "GET") {
      return route.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message: "Draft is temporarily unavailable." } },
      });
    }
    return route.continue();
  });
  await page.route(`**/api/v1/bingos/${board.id}/`, (route) => {
    if (route.request().method() === "GET") metadataReads += 1;
    return route.continue();
  });
  await page.goto(`/create?bingo=${board.id}`);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Draft is temporarily unavailable.",
  );
  await expect(page.getByRole("gridcell")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finish creating →" })).toHaveCount(0);
  const readsBeforeRetry = metadataReads;
  unavailable = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit bingo", exact: true })).toBeVisible();
  await expect(page.getByRole("gridcell")).toHaveCount(9);
  expect(metadataReads).toBe(readsBeforeRetry);
  expect(pageErrors).toEqual([]);
});

test("reply, edit and report forms retain context when discard is cancelled", async ({
  page,
}, testInfo) => {
  const bingo = await createSocialFormBoard(page);
  await authenticateAs(page, "player");
  await page.goto(`/bingo/${bingo.id}`);
  const rootBody = page.getByLabel("Add a comment", { exact: true });
  const ids: string[] = [];
  for (const body of ["First form parent", "Second form parent"]) {
    await rootBody.fill(`${body} ${Date.now()}`);
    const response = await waitForResponse(
      page,
      `/api/v1/bingos/${bingo.id}/comments/`,
      "POST",
      () => page.getByRole("button", { name: "Post comment", exact: true }).click(),
    );
    expect(response.status()).toBe(201);
    ids.push((await response.json()).id);
    await expect(rootBody).toHaveValue("");
  }
  const first = page.locator(`#comment-${ids[0]}`);
  const second = page.locator(`#comment-${ids[1]}`);
  const warnings: string[] = [];
  let discard = false;
  page.on("dialog", async (dialog) => {
    warnings.push(dialog.message());
    if (discard) await dialog.accept();
    else await dialog.dismiss();
  });
  await first.getByRole("button", { name: "Edit", exact: true }).click();
  const edited = first.getByLabel("Edit comment", { exact: true });
  await edited.fill("Keep edited text 🎲\n<literal> & context");
  await first.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(edited).toHaveValue("Keep edited text 🎲\n<literal> & context");
  await first.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edited).toHaveValue("Keep edited text 🎲\n<literal> & context");
  discard = true;
  await first.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(edited).toHaveCount(0);
  await expect(first.getByRole("button", { name: "Edit", exact: true })).toBeFocused();
  discard = false;
  await first.getByRole("button", { name: "Reply", exact: true }).click();
  const reply = first.getByLabel("Reply", { exact: true });
  await reply.fill("Keep this reply 🎲\nA second line");
  await first.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(reply).toHaveValue("Keep this reply 🎲\nA second line");
  await second.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(reply).toHaveValue("Keep this reply 🎲\nA second line");
  await expect(second.getByLabel("Reply", { exact: true })).toHaveCount(0);
  discard = true;
  await first.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(reply).toHaveCount(0);
  await expect(first.getByRole("button", { name: "Reply", exact: true })).toBeFocused();
  discard = false;

  const reportTrigger = page.getByRole("button", { name: "Report", exact: true }).first();
  await reportTrigger.click();
  const report = page.getByRole("dialog", { name: "Report bingo" });
  const context = report.getByLabel("Additional context (optional)", { exact: true });
  const text = "Moderator context 🎲\n<literal> & detail " + "界".repeat(300);
  await context.fill(text);
  await context.press("Escape");
  await expect(report).toBeVisible();
  await expect(context).toHaveValue(text);
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const accessibility = await new AxeBuilder({ page }).include("dialog.report-dialog").analyze();
    expect(accessibility.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`report-context-${width}.png`) });
  }
  let release: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let submissions = 0;
  await page.route("**/api/v1/reports/", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submissions += 1;
    await hold;
    await route.continue();
  });
  const received = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/reports/") && response.request().method() === "POST",
  );
  await report.getByRole("button", { name: "Send report", exact: true }).click();
  try {
    await expect(context).toBeDisabled();
    await expect(report.getByLabel("Reason", { exact: true })).toBeDisabled();
    await expect(report.getByRole("button", { name: "Close report dialog" })).toBeDisabled();
    await report.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    expect(submissions).toBe(1);
  } finally {
    release();
  }
  expect((await received).status()).toBe(201);
  await expect(report.getByRole("button", { name: "Done", exact: true })).toBeFocused();
  const successAccessibility = await new AxeBuilder({ page })
    .include("dialog.report-dialog")
    .analyze();
  expect(successAccessibility.violations).toEqual([]);
  await report.getByRole("button", { name: "Done", exact: true }).click();
  await expect(report).toHaveCount(0);
  await expect(reportTrigger).toBeFocused();
  expect(warnings).toEqual([
    "Discard your unsaved comment changes?",
    "Discard your unsaved comment changes?",
    "Discard your unsent reply?",
    "Discard your unsent reply?",
    "Discard this report? Your additional context has not been sent.",
  ]);
});

test("social field validation focuses retained input and remains accessible", async ({
  page,
}, testInfo) => {
  const bingo = await createSocialFormBoard(page);
  await authenticateAs(page, "player");
  await page.goto(`/bingo/${bingo.id}`);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  const root = page.getByLabel("Add a comment", { exact: true });
  await root.fill("Validation parent");
  const parentResponse = await waitForResponse(
    page,
    `/api/v1/bingos/${bingo.id}/comments/`,
    "POST",
    () => page.getByRole("button", { name: "Post comment", exact: true }).click(),
  );
  const parent = (await parentResponse.json()) as { id: string };
  const article = page.locator(`#comment-${parent.id}`);
  for (const scenario of [
    {
      kind: "root",
      path: `/api/v1/bingos/${bingo.id}/comments/`,
      method: "POST",
      label: "Add a comment",
      submit: "Post comment",
    },
    {
      kind: "reply",
      path: `/api/v1/comments/${parent.id}/replies/`,
      method: "POST",
      label: "Reply",
      submit: "Post reply",
    },
    {
      kind: "edit",
      path: `/api/v1/comments/${parent.id}/`,
      method: "PATCH",
      label: "Edit comment",
      submit: "Save",
    },
  ]) {
    if (scenario.kind !== "root")
      await article
        .getByRole("button", { name: scenario.kind === "reply" ? "Reply" : "Edit", exact: true })
        .click();
    const input = page.getByLabel(scenario.label, { exact: true });
    const retained = `Retain ${scenario.kind} text 🎲\n<literal> & context`;
    await input.fill(retained);
    await page.route(`**${scenario.path}`, (route) => {
      if (route.request().method() !== scenario.method) return route.continue();
      return route.continue({
        postData: JSON.stringify({ ...route.request().postDataJSON(), body: "x".repeat(2001) }),
      });
    });
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(scenario.path) && response.request().method() === scenario.method,
    );
    await page.getByRole("button", { name: scenario.submit, exact: true }).click();
    expect((await responsePromise).status()).toBe(400);
    await expect(input).toBeEnabled();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(retained);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription(/2000|2,000/);
    await page.unroute(`**${scenario.path}`);
    await input.fill(
      scenario.kind === "root" ? "" : scenario.kind === "edit" ? "Validation parent" : "x",
    );
    await expect(input).toHaveAttribute("aria-invalid", "false");
    if (scenario.kind === "reply") await input.fill("");
    if (scenario.kind !== "root")
      await input
        .locator("xpath=ancestor::form")
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
  }
  await page.getByRole("button", { name: "Report", exact: true }).first().click();
  const report = page.getByRole("dialog", { name: "Report bingo" });
  const context = report.getByLabel("Additional context (optional)", { exact: true });
  await context.fill("Keep this report context 🎲\n<literal> & detail");
  await page.route("**/api/v1/reports/", (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.continue({
      postData: JSON.stringify({
        ...route.request().postDataJSON(),
        reason: "invalid-reason",
        description: "x".repeat(2001),
      }),
    });
  });
  const reportResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/reports/") && response.request().method() === "POST",
  );
  await report.getByRole("button", { name: "Send report", exact: true }).click();
  expect((await reportResponse).status()).toBe(400);
  const reason = report.getByLabel("Reason", { exact: true });
  await expect(reason).toBeFocused();
  await expect(reason).toHaveAttribute("aria-invalid", "true");
  await expect(context).toHaveAttribute("aria-invalid", "true");
  await expect(context).toHaveValue("Keep this report context 🎲\n<literal> & detail");
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(
      (await new AxeBuilder({ page }).include("dialog.report-dialog").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`report-validation-${width}.png`) });
  }
  await reason.selectOption("other");
  await expect(reason).toHaveAttribute("aria-invalid", "false");
  await expect(context).toHaveAttribute("aria-invalid", "true");
  await context.fill("Corrected moderator context");
  await expect(context).toHaveAttribute("aria-invalid", "false");
  expect(pageErrors).toEqual([]);
});

test("account forms submit filled DOM values and retain them after real validation", async ({
  page,
}) => {
  await authenticateAs(page, "author");
  await page.goto("/profile");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  page.on("dialog", (dialog) => dialog.accept());
  for (const scenario of [
    {
      title: "Change password",
      endpoint: "password-change/",
      fields: {
        current_password: "Filled-Incorrect!2026",
        new_password: "Filled-New-Password!2026",
        "confirm-new-password": "Filled-New-Password!2026",
      },
      expected: {
        current_password: "Filled-Incorrect!2026",
        new_password: "Filled-New-Password!2026",
      },
    },
    {
      title: "Change email",
      endpoint: "email-change/",
      fields: {
        new_email: "filled@example.test",
        "email-change-password": "Filled-Incorrect!2026",
      },
      expected: { new_email: "filled@example.test", current_password: "Filled-Incorrect!2026" },
    },
    {
      title: "Delete account",
      endpoint: "account-deletion/",
      fields: { deletion_password: "Filled-Incorrect!2026" },
      expected: { password: "Filled-Incorrect!2026" },
    },
  ]) {
    const form = page
      .locator("form.settings-card")
      .filter({ has: page.getByRole("heading", { name: scenario.title, exact: true }) });
    await expect(form).toBeVisible();
    await form.evaluate((element: HTMLFormElement, fields) => {
      for (const [name, value] of Object.entries(fields)) {
        (element.elements.namedItem(name) as HTMLInputElement).value = value!;
      }
    }, scenario.fields);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/v1/auth/${scenario.endpoint}`) &&
        response.request().method() === "POST",
    );
    await form.locator('button[type="submit"]').click();
    const response = await responsePromise;
    expect(response.status()).toBe(400);
    expect(response.request().postDataJSON()).toEqual(scenario.expected);
    await expect(form.getByRole("alert")).toBeVisible();
    for (const [name, value] of Object.entries(scenario.fields)) {
      await expect(form.locator(`input[name="${name}"]`)).toHaveValue(value!);
    }
    await expect(form.locator('button[type="submit"]')).toBeEnabled();
  }
  expect(pageErrors).toEqual([]);
});

test("browser error diagnostics reach the CSRF-protected backend with no private content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/support?private-marker=secret#private-marker");
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Log in", exact: true })).toBeVisible();
  const accepted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/client-errors/") && response.request().method() === "POST",
  );
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("private-marker") }));
  });
  const response = await accepted;
  expect(response.status()).toBe(204);
  expect(response.request().postDataJSON()).toMatchObject({
    kind: "exception",
    error_type: "TypeError",
    surface: "support",
  });
  expect(response.request().postData()).not.toContain("private-marker");
  expect(response.request().headers()["x-csrftoken"]).toBeTruthy();
  if (process.env.NEXT_PUBLIC_APP_RELEASE) {
    expect(response.request().headers()["x-neb-client-release"]).toBe(
      process.env.NEXT_PUBLIC_APP_RELEASE,
    );
  }
  await page.getByRole("button", { name: "Close account dialog" }).click();
  await expect(page.getByRole("heading", { name: "Support & Moderation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("page arrivals and primary navigation reach first-party analytics without URL values", async ({
  page,
}) => {
  const events: Array<{ event_type: string; metadata: Record<string, string> }> = [];
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/interactions/") && response.status() === 202) {
      events.push(...response.request().postDataJSON().events);
    }
  });
  await page.goto("/discover?private-marker=never-record-this");
  await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      events.some(
        (event) => event.event_type === "page_view" && event.metadata.surface === "discover",
      ),
    )
    .toBe(true);
  await page.getByRole("link", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create your own bingo", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      events.some((event) => event.event_type === "cta" && event.metadata.action === "create"),
    )
    .toBe(true);
  expect(JSON.stringify(events.map((event) => event.metadata))).not.toContain("marker");
  expect(JSON.stringify(events.map((event) => event.metadata))).not.toContain("never-record-this");
});

async function authenticateAs(page: Page, role: FixtureRole) {
  const state = JSON.parse(readFileSync(authStatePath(role), "utf8")) as {
    cookies: Parameters<BrowserContext["addCookies"]>[0];
  };
  await page.context().clearCookies();
  await page.context().addCookies(state.cookies);
}

async function createSocialFormBoard(page: Page): Promise<{ id: string }> {
  await authenticateAs(page, "author");
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const headers = { "X-CSRFToken": csrf!.value, "Idempotency-Key": randomUUID() };
  const created = await page.context().request.post("/api/v1/drafts/", {
    headers,
    data: {
      title: `Social form QA ${randomUUID()}`,
      visibility: "unlisted",
      language: "en",
      size: 3,
      cells: Array.from({ length: 9 }, (_, position) => ({
        position,
        row: Math.floor(position / 3),
        column: position % 3,
        text: `Form cell ${position + 1}`,
      })),
    },
  });
  expect(created.status()).toBe(201);
  const draft = (await created.json()) as { bingo_id: string };
  socialFormBoards.set(page, draft.bingo_id);
  const published = await page.context().request.post(`/api/v1/bingos/${draft.bingo_id}/publish/`, {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
  });
  expect(published.status()).toBe(201);
  return { id: draft.bingo_id };
}

test("adversarial content stays literal and unsafe inputs cannot change resource boundaries", async ({
  page,
}) => {
  await authenticateAs(page, "author");
  await page.goto("/discover");
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const headers = { "X-CSRFToken": csrf!.value, Origin: new URL(page.url()).origin };
  const samples = [
    "<script>globalThis.__nebInjected=true</script>",
    '<img src=x onerror="globalThis.__nebInjected=true">',
    "javascript:alert('x')",
    "' OR 1=1 --",
  ];
  const title = `Safe <script> marker '${Date.now()}' OR 1=1 --`;
  const document = {
    title,
    size: 3,
    visibility: "public",
    language: "en",
    cells: Array.from({ length: 9 }, (_, position) => ({
      position,
      row: Math.floor(position / 3),
      column: position % 3,
      text: samples[position] ?? "Literal text",
    })),
  };
  const created = await page.context().request.post("/api/v1/drafts/", {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
    data: document,
  });
  expect(created.status()).toBe(201);
  const draft = (await created.json()) as { bingo_id: string };
  const published = await page.context().request.post(`/api/v1/bingos/${draft.bingo_id}/publish/`, {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
  });
  expect(published.status()).toBe(201);

  for (const changes of [
    { size: -1 },
    { size: 3.5 },
    { size: 1_000_000 },
    { language: "invalid" },
  ]) {
    const invalid = await page.context().request.post("/api/v1/drafts/", {
      headers: { ...headers, "Idempotency-Key": randomUUID() },
      data: { ...document, ...changes },
    });
    expect(invalid.status()).toBe(400);
  }
  const upload = await page.context().request.post("/api/v1/uploads/intents/", {
    headers,
    data: {
      kind: "cell_image",
      file_name: "../../<script>alert(1)</script>.png",
      content_type: "image/png",
      size: cellImagePng.length,
    },
  });
  expect(upload.status()).toBe(201);
  const intent = (await upload.json()) as {
    id: string;
    upload: { fields: { key?: string }; url: string };
  };
  const destination = intent.upload.fields.key ?? new URL(intent.upload.url, page.url()).pathname;
  expect(destination).not.toMatch(/\.\.|<|>|script|alert/);
  expect(
    (await page.context().request.delete(`/api/v1/uploads/${intent.id}/`, { headers })).status(),
  ).toBe(204);

  await page.goto(`/login?next=${encodeURIComponent("https://example.invalid/unsafe-return")}`);
  await expect(page).toHaveURL(/\/discover$/);
  await page.context().clearCookies();
  await page.goto(`/bingo/${draft.bingo_id}`);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  for (const text of samples)
    await expect(page.locator(".play-cell__text").filter({ hasText: text })).toHaveText(text);
  expect(await page.evaluate(() => "__nebInjected" in window)).toBe(false);
  await expect(
    page.locator(".play-cell__text script, .play-cell__text img, .play-cell__text a"),
  ).toHaveCount(0);
  const result = await page.context().request.get("/api/v1/bingos/", { params: { search: title } });
  expect(result.status()).toBe(200);
  expect((await result.json()).count).toBe(1);
  expect((await page.context().request.get("/api/v1/bingos/-1/")).status()).toBe(404);
});

test("published multilingual bingo downloads as PNG and PDF through the real worker", async ({
  page,
}) => {
  await authenticateAs(page, "author");
  await page.goto("/discover");
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const headers = {
    "X-CSRFToken": csrf!.value,
    Origin: new URL(page.url()).origin,
    "Idempotency-Key": randomUUID(),
  };
  const samples = [
    "Привет мир",
    "Привіт світ",
    "مرحبا بالعالم",
    "नमस्ते दुनिया",
    "こんにちは世界",
    "안녕하세요 세계",
    "你好世界",
    "Grüße, çığ, ação 🎉 👩🏽‍💻",
    "<b>&\n1\n2\n3\n4\n5\n6\n7\nEND",
  ];
  const created = await page.context().request.post("/api/v1/drafts/", {
    headers,
    data: {
      title: "Бинго 日本語 العربية हिन्दी 🎉",
      size: 3,
      language: "ru",
      cells: samples.map((text, position) => ({
        position,
        row: Math.floor(position / 3),
        column: position % 3,
        text,
      })),
    },
  });
  expect(created.status()).toBe(201);
  const draft = (await created.json()) as { bingo_id: string };
  const published = await page.context().request.post(`/api/v1/bingos/${draft.bingo_id}/publish/`, {
    headers: { ...headers, "Idempotency-Key": randomUUID() },
  });
  expect(published.ok()).toBe(true);
  await page.goto(`/create?bingo=${draft.bingo_id}`);
  await expect(page.getByRole("heading", { name: "Edit bingo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish creating →" }).click();
  await page.getByText("Download published version", { exact: true }).click();
  for (const format of ["PNG", "PDF"] as const) {
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    const button = page.getByRole("button", { name: `Published ${format}`, exact: true });
    await button.click();
    const download = await downloadPromise;
    expect(await download.failure()).toBeNull();
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format.toLowerCase()}$`));
    const bytes = readFileSync((await download.path())!);
    expect(bytes.subarray(0, format === "PNG" ? 8 : 4)).toEqual(
      format === "PNG" ? Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) : Buffer.from("%PDF"),
    );
    await expect(button).toBeEnabled();
  }
});

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

async function expectNoAccessibilityViolations(page: Page) {
  const levels = await page
    .locator("h1, h2, h3, h4, h5, h6")
    .evaluateAll((headings) =>
      headings
        .filter((heading) => heading.getClientRects().length > 0)
        .map((heading) => Number(heading.tagName.slice(1))),
    );
  expect(levels.filter((level) => level === 1)).toHaveLength(1);
  expect(levels[0]).toBe(1);
  for (let index = 1; index < levels.length; index += 1) {
    expect(levels[index]).toBeLessThanOrEqual(levels[index - 1]! + 1);
  }
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    results.violations
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

async function passwordResetLink(
  request: APIRequestContext,
  email: string,
  previousMessageIds: ReadonlySet<string>,
): Promise<string> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const listResponse = await request.get(`${mailpitBaseURL}/api/v1/messages?limit=100`);
    if (listResponse.ok()) {
      const rows = messageRows(await listResponse.json());
      const matching = rows.find((row) => {
        const text = JSON.stringify(row).toLowerCase();
        const messageId = row.ID ?? row.Id ?? row.id;
        return (
          typeof messageId === "string" &&
          !previousMessageIds.has(messageId) &&
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

// These flows use the initial player session. Destructive account flows run later.
test("unsent report restores after client history navigation and clears after sending", async ({
  page,
}, testInfo) => {
  const bingo = await createSocialFormBoard(page);
  await authenticateAs(page, "player");
  await page.goto(`/bingo/${bingo.id}`);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  const trigger = page
    .locator(".play-actions")
    .getByRole("button", { name: "Report", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Report bingo" });
  const reason = dialog.getByLabel("Reason", { exact: true });
  const context = dialog.getByLabel("Additional context (optional)", { exact: true });
  const text = "Recover this private report 🎲\n<literal> & context";
  await reason.selectOption("other");
  await context.fill(text);
  await page.goForward();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  await trigger.click();
  await expect(context).toHaveValue(text);
  await expect(reason).toHaveValue("other");
  await expect(dialog.getByRole("status")).toContainText("Unsent report restored");
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(
      (await new AxeBuilder({ page }).include("dialog.report-dialog").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`restored-report-${width}.png`) });
  }
  const sent = await waitForResponse(page, "/api/v1/reports/", "POST", () =>
    dialog.getByRole("button", { name: "Send report", exact: true }).click(),
  );
  expect(sent.status()).toBe(201);
  expect(sent.request().postDataJSON()).toMatchObject({
    target_type: "bingo",
    target_id: bingo.id,
    reason: "other",
    description: text,
  });
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await trigger.click();
  await expect(context).toHaveValue("");
  await expect(reason).toHaveValue("spam");
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await reason.selectOption("harassment");
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await trigger.click();
  await expect(reason).toHaveValue("spam");
});

test("unsent report returns after same-account authentication recovery", async ({ page }) => {
  const bingo = await createSocialFormBoard(page);
  await authenticateAs(page, "player");
  await page.goto(`/bingo/${bingo.id}`);
  const trigger = page
    .locator(".play-actions")
    .getByRole("button", { name: "Report", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Report bingo" });
  const context = dialog.getByLabel("Additional context (optional)", { exact: true });
  const text = "Keep report through authentication 🎲\n<literal> & context";
  await dialog.getByLabel("Reason", { exact: true }).selectOption("other");
  await context.fill(text);
  await page.context().clearCookies();
  const expiredPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/reports/") && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Send report", exact: true }).click();
  const expired = await expiredPromise;
  expect(expired.status()).toBe(401);
  const login = page.getByRole("dialog", { name: "Log in", exact: true });
  await expect(login).toBeVisible();
  await login.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.player.email);
  await login.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
  await login.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(login).toHaveCount(0);
  await trigger.click();
  await expect(context).toHaveValue(text);
  await expect(dialog.getByLabel("Reason", { exact: true })).toHaveValue("other");
  await expect(dialog.getByRole("status")).toContainText("Unsent report restored");
});

test("report rejection for an archived target keeps context and destination", async ({
  page,
  playwright,
}) => {
  const bingo = await createSocialFormBoard(page);
  await authenticateAs(page, "player");
  await page.goto(`/bingo/${bingo.id}`);
  await expect(page.locator("button.play-cell").first()).toBeEnabled();
  await page.locator(".play-actions").getByRole("button", { name: "Report", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Report bingo" });
  await expect(dialog).toBeVisible();
  const context = dialog.getByLabel("Additional context (optional)", { exact: true });
  const text = "Keep context when target becomes unavailable 🎲";
  await context.fill(text);
  const authorState = JSON.parse(readFileSync(authStatePath("author"), "utf8")) as {
    cookies: Array<{ name: string; value: string }>;
  };
  const csrf = authorState.cookies.find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const author = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authStatePath("author"),
  });
  try {
    const archived = await author.post(`/api/v1/bingos/${bingo.id}/archive/`, {
      headers: { "X-CSRFToken": csrf!.value },
    });
    expect(archived.status()).toBe(200);
    const rejectedPromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/reports/") && response.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Send report", exact: true }).click();
    const rejected = await rejectedPromise;
    expect(rejected.status()).toBe(400);
    expect(rejected.request().postDataJSON()).toMatchObject({
      target_type: "bingo",
      target_id: bingo.id,
      description: text,
    });
    await expect(context).toHaveValue(text);
    await expect(context).toBeEnabled();
    await expect(dialog.getByRole("alert")).toContainText("unavailable");
    await expect(dialog.getByRole("button", { name: "Send report", exact: true })).toBeEnabled();
  } finally {
    await author.dispose();
  }
});

test("explicit cross-tab logout clears a retained report before same-account login", async ({
  page,
}) => {
  const bingo = await createSocialFormBoard(page);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.player.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await page.goto(`/bingo/${bingo.id}`);
  const trigger = page
    .locator(".play-actions")
    .getByRole("button", { name: "Report", exact: true });
  await trigger.click();
  const report = page.getByRole("dialog", { name: "Report bingo" });
  await report.getByLabel("Reason", { exact: true }).selectOption("other");
  await report
    .getByLabel("Additional context (optional)", { exact: true })
    .fill("Remove this private report on explicit logout 🎲");
  const settings = await page.context().newPage();
  try {
    await settings.goto("/profile");
    await settings.getByRole("button", { name: "Log out", exact: true }).click();
    const login = page.getByRole("dialog", { name: "Log in", exact: true });
    await expect(login).toBeVisible();
    await expect(report).toHaveCount(0);
    await login.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.player.email);
    await login.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
    await login.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(login).toHaveCount(0);
    await trigger.click();
    await expect(report.getByLabel("Reason", { exact: true })).toHaveValue("spam");
    await expect(report.getByLabel("Additional context (optional)", { exact: true })).toHaveValue(
      "",
    );
    await expect(report.getByRole("status")).toHaveCount(0);
  } finally {
    await settings.close();
  }
});

test("reply and nested edit restore after their conversation moves to another list page", async ({
  page,
}, testInfo) => {
  const fixture = readLiveFixture();
  const bingo = fixture.bingos.social;
  const context = fixture.social_context;
  await authenticateAs(page, "player");
  await page.goto(`/bingo/${bingo.id}`);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  const root = page.locator(`#comment-${context.root_id}`);
  await root.getByRole("button", { name: "View all 6 replies", exact: true }).click();
  const nested = page.locator(`#comment-${context.reply_id}`);
  await nested.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = nested.getByLabel("Edit comment", { exact: true });
  const editedText = "Recovered nested changes 🎲\n<literal> & context";
  await edit.fill(editedText);
  await root.getByRole("button", { name: "Reply", exact: true }).click();
  const reply = root.getByLabel("Reply", { exact: true });
  const replyText = "Recovered exact reply 🎲\n<literal> & context";
  await reply.fill(replyText);
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const shifted = await page.context().request.post(`/api/v1/bingos/${bingo.id}/comments/`, {
    headers: { "X-CSRFToken": csrf!.value },
    data: { body: "A newer comment moves the original conversation to page two" },
  });
  expect(shifted.status()).toBe(201);
  const firstPage = await page.context().request.get(`/api/v1/bingos/${bingo.id}/comments/`);
  expect(firstPage.status()).toBe(200);
  expect(
    ((await firstPage.json()) as { results: Array<{ id: string }> }).results.map(
      (comment) => comment.id,
    ),
  ).not.toContain(context.root_id);
  await page.goForward();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(reply).toHaveValue(replyText);
  await expect(edit).toHaveValue(editedText);
  await expect(root).toContainText("Original recovery conversation");
  await expect(root.getByRole("status").filter({ hasText: "Unsent reply restored" })).toBeVisible();
  await expect(
    nested.getByRole("status").filter({ hasText: "Unsaved comment changes restored" }),
  ).toBeVisible();
  await expect(page.locator(`#comment-${context.root_id}`)).toHaveCount(1);
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    await reply.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(
      (await new AxeBuilder({ page }).include(".comments-panel").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`restored-inline-${width}.png`) });
  }
  const saved = await waitForResponse(page, `/api/v1/comments/${context.reply_id}/`, "PATCH", () =>
    nested.getByRole("button", { name: "Save", exact: true }).click(),
  );
  expect((await saved.json()).body).toBe(editedText);
  await expect(nested.locator(".comment__body")).toContainText(editedText);
  const posted = await waitForResponse(
    page,
    `/api/v1/comments/${context.root_id}/replies/`,
    "POST",
    () => root.getByRole("button", { name: "Post reply", exact: true }).click(),
  );
  const created = (await posted.json()) as { id: string; body: string };
  expect(created.body).toBe(replyText);
  await expect(page.locator(`#comment-${created.id}`)).toContainText(replyText);
  await page.goForward();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  await expect(page.getByLabel("Reply", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Edit comment", { exact: true })).toHaveCount(0);
});

test("reply and edit return after same-account login and clear on cross-tab logout", async ({
  page,
}) => {
  const bingo = await createSocialFormBoard(page);
  await page.goto(`/bingo/${bingo.id}`);
  await page.getByLabel("Add a comment", { exact: true }).fill("Authentication recovery parent");
  const posted = await waitForResponse(page, `/api/v1/bingos/${bingo.id}/comments/`, "POST", () =>
    page.getByRole("button", { name: "Post comment", exact: true }).click(),
  );
  const parent = (await posted.json()) as { id: string };
  const root = page.locator(`#comment-${parent.id}`);
  await root.getByRole("button", { name: "Edit", exact: true }).click();
  await root
    .getByLabel("Edit comment", { exact: true })
    .fill("Retained changes through login 🎲\n<literal> & context");
  await root.getByRole("button", { name: "Reply", exact: true }).click();
  await root
    .getByLabel("Reply", { exact: true })
    .fill("Retained reply through login 🎲\n<literal> & context");
  await page.context().clearCookies();
  const expired = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/comments/${parent.id}/`) &&
      response.request().method() === "PATCH",
  );
  await root.getByRole("button", { name: "Save", exact: true }).click();
  expect((await expired).status()).toBe(401);
  const login = page.getByRole("dialog", { name: "Log in", exact: true });
  await expect(login).toBeVisible();
  await login.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.author.email);
  await login.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
  await login.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(login).toHaveCount(0);
  await expect(root.getByLabel("Edit comment", { exact: true })).toHaveValue(
    "Retained changes through login 🎲\n<literal> & context",
  );
  await expect(root.getByLabel("Reply", { exact: true })).toHaveValue(
    "Retained reply through login 🎲\n<literal> & context",
  );
  const settings = await page.context().newPage();
  try {
    await settings.goto("/profile");
    await settings.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(login).toBeVisible();
    await expect(page.getByLabel("Edit comment", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Reply", { exact: true })).toHaveCount(0);
    await login.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.author.email);
    await login.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
    await login.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(login).toHaveCount(0);
    await expect(page.getByLabel("Edit comment", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Reply", { exact: true })).toHaveCount(0);
  } finally {
    await settings.close();
  }
});

test("deleted recovery targets keep copyable reply and edit text without enabling submission", async ({
  page,
}, testInfo) => {
  const bingo = await createSocialFormBoard(page);
  await page.goto(`/bingo/${bingo.id}`);
  await expect(page.getByLabel("Add a comment", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  await page
    .getByLabel("Add a comment", { exact: true })
    .fill("Parent deleted while drafts are open");
  const posted = await waitForResponse(page, `/api/v1/bingos/${bingo.id}/comments/`, "POST", () =>
    page.getByRole("button", { name: "Post comment", exact: true }).click(),
  );
  const parent = (await posted.json()) as { id: string };
  const root = page.locator(`#comment-${parent.id}`);
  await root.getByRole("button", { name: "Edit", exact: true }).click();
  const editText = "Copy these unsaved changes 🎲\n<literal> & context";
  const replyText = "Copy this unsent reply 🎲\n<literal> & context";
  await root.getByLabel("Edit comment", { exact: true }).fill(editText);
  await root.getByRole("button", { name: "Reply", exact: true }).click();
  await root.getByLabel("Reply", { exact: true }).fill(replyText);
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const removed = await page
    .context()
    .request.delete(`/api/v1/comments/${parent.id}/`, { headers: { "X-CSRFToken": csrf!.value } });
  expect(removed.status()).toBe(204);
  await page.goForward();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  await expect(root.getByLabel("Edit comment", { exact: true })).toHaveValue(editText);
  await expect(root.getByLabel("Reply", { exact: true })).toHaveValue(replyText);
  await expect(root.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(root.getByRole("button", { name: "Post reply", exact: true })).toBeDisabled();
  await expect(root.getByRole("alert")).toHaveCount(2);
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    await root.getByLabel("Reply", { exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(
      (await new AxeBuilder({ page }).include(".comments-panel").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`deleted-inline-${width}.png`) });
  }
});

test("failed context recovery retains inline text and retries the original conversation", async ({
  page,
}) => {
  const bingo = await createSocialFormBoard(page);
  await page.goto(`/bingo/${bingo.id}`);
  await expect(page.getByLabel("Add a comment", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  await page.getByLabel("Add a comment", { exact: true }).fill("Recovery network parent");
  const posted = await waitForResponse(page, `/api/v1/bingos/${bingo.id}/comments/`, "POST", () =>
    page.getByRole("button", { name: "Post comment", exact: true }).click(),
  );
  const parent = (await posted.json()) as { id: string };
  const root = page.locator(`#comment-${parent.id}`);
  await root.getByRole("button", { name: "Edit", exact: true }).click();
  const text = "Keep exact text when context fails 🎲\n<literal> & context";
  await root.getByLabel("Edit comment", { exact: true }).fill(text);
  const path = `**/api/v1/comments/${parent.id}/context/`;
  await page.route(path, (route) => route.abort("failed"));
  await page.goForward();
  await expect(page).toHaveURL(/\/explore$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  await expect(page.getByLabel("Recovered comment changes", { exact: true })).toHaveValue(text);
  await expect(page.locator(".comment-recovery").getByRole("alert")).toContainText(
    "Your draft is retained",
  );
  await expect(root.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await page.unroute(path);
  await page
    .locator(".comment-recovery")
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(root.getByLabel("Edit comment", { exact: true })).toHaveValue(text);
  await expect(root.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Recovered comment changes", { exact: true })).toHaveCount(0);
});

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
    await page.setViewportSize({ width: 320, height: 667 });
    await page.goto("/discover");
    await expect(page.getByText("Free to play as a guest.", { exact: false })).toBeVisible();
    const primaryAction = await page.getByRole("link", { name: "Find a bingo" }).boundingBox();
    expect(primaryAction).not.toBeNull();
    expect(primaryAction!.y + primaryAction!.height).toBeLessThanOrEqual(667);
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
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const nonce = `${Date.now().toString(36)}${testInfo.retry}`;
    const email = `e2e-signup-${nonce}@example.test`;
    const username = `e2e_signup_${nonce}`.slice(0, 30);
    const password = "E2E-Signup-Password!2026";

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Join Not Enough Bingo" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Username").fill(`  ${username}  `);
    await page.getByLabel("Password").fill(password);
    await expect(page.getByLabel("Username")).toHaveValue(username);
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
    await page.getByRole("link", { name: "Continue to log in" }).click();
    const login = page.getByRole("dialog", { name: "Log in", exact: true });
    await expect(login).toBeVisible();
    await login.getByLabel("Email").fill(email);
    await login.getByLabel("Password").fill(password);
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      login.getByRole("button", { name: "Log in" }).click(),
    );
    await expect(page.locator('a[href="/profile"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Which bingo languages do you prefer?" }),
    ).toBeVisible();
    for (const width of [1710, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const languages = page.getByRole("dialog");
      expect(
        await languages.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`registration-languages-${width}.png`) });
    }
    await page.getByRole("button", { name: "Maybe later" }).click();
    const reminder = page.getByRole("dialog", { name: "Language settings" });
    await expect(reminder).toContainText("Profile settings, under Bingo languages");
    for (const width of [1710, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(reminder.getByRole("button", { name: "Got it" })).toBeInViewport();
      expect(await reminder.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath(`language-reminder-${width}.png`) });
    }
    await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      reminder.getByRole("button", { name: "Got it" }).click(),
    );
    await expect(reminder).toBeHidden();
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "No published bingos yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create a bingo" })).toBeVisible();
    await page.getByRole("tab", { name: "Drafts" }).click();
    await expect(page.getByRole("heading", { name: "No drafts yet" })).toBeVisible();
    await page.getByRole("tab", { name: "Recent plays" }).click();
    await expect(page.getByRole("heading", { name: "No plays yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Find a bingo" })).toBeVisible();
    await page.goto("/profile");
    await page.getByRole("group", { name: "Preferred languages" }).getByLabel("Russian").check();
    await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      page.getByRole("button", { name: "Save languages" }).click(),
    );
    await page.goto("/discover");
    await expect(
      page.getByRole("heading", { name: "Which bingo languages do you prefer?" }),
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("existing accounts see languages only in settings, not while browsing", async ({ page }) => {
    await authenticateAs(page, "player");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/discover");
    await expect(
      page.getByRole("heading", { name: "Which bingo languages do you prefer?" }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Which bingo languages do you prefer?" }),
    ).toHaveCount(0);
    await page.goto("/profile");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await expect(
      page.getByRole("group", { name: "Preferred languages" }).getByRole("checkbox", {
        checked: true,
      }),
    ).toHaveCount(0);
  });

  test("zero-data search, comments, notifications, and editor explain the next step", async ({
    page,
  }) => {
    const bingo = readLiveFixture().bingos.public;
    await page.goto("/explore?search=no-such-bingo-in-this-fixture");
    await expect(page.getByRole("heading", { name: "No matching bingos" })).toBeVisible();
    await expect(page.getByText("Try fewer filters or a different search phrase.")).toBeVisible();

    await page.goto(`/bingo/${bingo.id}`);
    await expect(page.getByRole("heading", { name: "No comments yet" })).toBeVisible();

    await authenticateAs(page, "player");
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "All quiet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark all as read" })).toBeDisabled();

    await authenticateAs(page, "author");
    await page.goto("/create");
    await expect(page.getByRole("button", { name: "Row 1, column 1: empty" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await page.getByRole("button", { name: "Finish creating" }).click();
    await expect(page.getByText("No cover selected")).toBeVisible();
  });

  test("Explore search submits, filters, reloads, and clears through its URL", async ({ page }) => {
    const title = readLiveFixture().bingos.public.title;
    await page.goto("/explore");
    const search = page.getByRole("searchbox", { name: "Search by title" });
    await search.fill("  E2E PUBLIC  ");
    await search.press("Enter");
    await expect(page).toHaveURL(/search=E2E\+PUBLIC/);
    await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();
    await page.reload();
    await expect(search).toHaveValue("E2E PUBLIC");

    await page.getByRole("radio", { name: /New Recently published/ }).check();
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/search=E2E\+PUBLIC.*ordering=newest/);
    await expect(page.getByRole("radio", { name: /New Recently published/ })).toBeChecked();

    await expect(page.getByRole("group", { name: "Bingo languages" })).toHaveCount(0);
    await page.goto("/explore?search=E2E+PUBLIC&languages=ru");
    await expect(page).toHaveURL(/search=E2E\+PUBLIC.*languages=ru/);
    await expect(page.getByRole("heading", { name: "No matching bingos" })).toBeVisible();

    await page.getByRole("button", { name: "Clear all filters" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(search).toHaveValue("");
    await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();

    await page.goto("/explore?tags=e2e%2C%20public");
    await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();
    await page.reload();
    await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();

    await page.getByRole("combobox", { name: "Tags" }).fill(Array(16).fill("public").join(", "));
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Tags" })).toBeFocused();
    await expect(page.getByRole("combobox", { name: "Tags" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator("#explore-tags-error")).toHaveText("Choose at most 15 tags.");
    await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();

    await page.goto(`/explore?tags=${encodeURIComponent(Array(16).fill("public").join(", "))}`);
    await expect(page.locator("main [role='alert']")).toContainText("Choose at most 15 tags.");
    await expect(page.locator(".bingo-card")).toHaveCount(0);
  });

  test("author creates, saves, edits, and publishes a draft", async ({ page }, testInfo) => {
    const title = `E2E UI Created Board ${testInfo.retry}`;
    await authenticateAs(page, "author");
    await page.goto("/create");
    await expect(page.getByRole("heading", { name: "Create bingo" })).toBeVisible();

    await page.getByRole("gridcell").first().click();
    await expect(page.getByRole("slider", { name: "Background opacity" })).toHaveAttribute(
      "aria-valuetext",
      "100 percent",
    );
    await expect(page.getByRole("slider", { name: "Image opacity" })).toHaveAttribute(
      "aria-valuetext",
      "100 percent",
    );
    await expect(page.getByRole("slider", { name: "Border width" })).toHaveAttribute(
      "aria-valuetext",
      "1 pixel",
    );
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
    const publicationError = page.locator(".details-panel > .form-message--error");
    await page.getByRole("button", { name: "Publish bingo" }).click();
    await expect(page.locator("#bingo-title-error")).toHaveText("Add a title before publishing.");
    await expect(page.getByLabel("Title")).toBeFocused();
    await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Title").fill("A required fields test");
    await page.getByRole("button", { name: "Publish bingo" }).click();
    await expect(page.locator("#bingo-language-error")).toHaveText(
      "Choose a bingo language before publishing.",
    );
    await expect(page.getByLabel("Bingo language")).toBeFocused();
    await expect(page.getByLabel("Bingo language")).toHaveAttribute("aria-invalid", "true");

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

  test("editor controls keep touch-sized targets without horizontal overflow", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    await expect(page.getByRole("heading", { name: "Cell editor" })).toBeVisible();
    await page.keyboard.press("Escape");
    const controls = page.locator(
      ".editor-history-actions button, .size-control button, .format-row button, .color-input",
    );
    await expect(controls).toHaveCount(11);
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      const targets = await controls.evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return { width: bounds.width, height: bounds.height };
        }),
      );
      for (const target of targets) {
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
  });

  test("deleting a bingo requires confirmation and removes its old link", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    await page
      .getByRole("textbox", { name: "Text for row 1, column 1" })
      .fill("A board to delete safely");
    await page.getByRole("button", { name: "Finish creating →" }).click();
    const title = "E2E Deletion Confirmation";
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Bingo language").selectOption("en");
    await waitForResponse(page, "/publish/", "POST", () =>
      page.getByRole("button", { name: "Publish bingo" }).click(),
    );
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const deletedPath = new URL(page.url()).pathname;

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("its link will stop working");
      return dialog.dismiss();
    });
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await waitForResponse(page, `/api/v1/bingos/${deletedPath.split("/").at(-1)}/`, "DELETE", () =>
      page.getByRole("button", { name: "Delete", exact: true }).click(),
    );
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByRole("tab", { name: "Created" }).click();
    await expect(page.locator(".bingo-card").filter({ hasText: title })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("heading", { name: title })).toHaveCount(0);
    const deletedPage = await page.goto(deletedPath);
    expect(deletedPage?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Nothing on this square" })).toBeVisible();
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

  test("an author can archive a bingo and restore its public availability", async ({
    page,
    request,
  }) => {
    const bingo = readLiveFixture().bingos.public;
    await authenticateAs(page, "author");
    await page.goto(`/bingo/${bingo.id}`);
    await waitForResponse(page, `/api/v1/bingos/${bingo.id}/archive/`, "POST", () =>
      page.getByRole("button", { name: "Archive", exact: true }).click(),
    );
    await expect(
      page.getByText("This bingo is archived and shown read-only to its author."),
    ).toBeVisible();
    expect((await request.get(`/api/v1/bingos/${bingo.id}/`)).status()).toBe(404);
    await page.reload();
    await waitForResponse(page, `/api/v1/bingos/${bingo.id}/restore/`, "POST", () =>
      page.getByRole("button", { name: "Restore", exact: true }).click(),
    );
    await expect(page.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
    expect((await request.get(`/api/v1/bingos/${bingo.id}/`)).status()).toBe(200);
    await page.reload();
    await expect(page.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
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
    await expect(page.getByRole("dialog", { name: "Log in", exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(draftPath.replace("?", "\\?")));
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
    await page.reload();
    await expect(page.getByRole("gridcell", { name: /Unsaved after expiry/ })).toBeVisible();
  });

  test("a different account cannot inherit the editor after session expiry", async ({ page }) => {
    const fixture = readLiveFixture();
    const secretText = "Previous account private editor text";
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    await page.getByRole("textbox", { name: "Text for row 1, column 1" }).fill(secretText);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.context().clearCookies();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const login = page.getByRole("dialog", { name: "Log in", exact: true });
    await expect(login).toBeVisible();
    await login.getByLabel("Email").fill(fixture.users.player.email);
    await login.getByLabel("Password").fill(E2E_FIXTURE_PASSWORD);
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      login.getByRole("button", { name: "Log in", exact: true }).click(),
    );
    await expect(page.getByRole("link", { name: "Profile for E2E Player" })).toBeVisible();
    await expect(page.getByRole("gridcell", { name: new RegExp(secretText) })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save draft", exact: true })).toHaveCount(0);
    await expect(page.locator("main [role='alert']")).toBeVisible();
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
    expect((await denied).status()).toBe(401);
    await expect(page.getByRole("dialog", { name: "Log in", exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
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
      name: "empty.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(0),
    });
    await expect(page.locator(".form-message--error")).toContainText(
      "The image is empty. Choose another image.",
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
    await page.getByRole("textbox", { name: "Text for row 1, column 1" }).press("Escape");
    await expect(page.getByRole("heading", { name: "Cell editor" })).toBeVisible();
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

  test("Unicode filenames with spaces can be uploaded again without collisions", async ({
    page,
  }) => {
    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    await page.getByRole("textbox", { name: "Text for row 1, column 1" }).press("Escape");
    const input = page.getByLabel("Add image to cell");
    const assetIds: string[] = [];
    let lastThumbnailUrl = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const intent = page.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/uploads/intents/") &&
          response.request().method() === "POST",
      );
      await input.setInputFiles({
        name: "файл пример.png",
        mimeType: "image/png",
        buffer: cellImagePng,
      });
      const response = await intent;
      expect(response.status()).toBe(201);
      assetIds.push((await response.json()).asset_id);
      await expect(page.getByRole("button", { name: "Remove cell image" })).toBeVisible();
      const detail = await page.context().request.get(`/api/v1/uploads/${assetIds.at(-1)}/`);
      expect(detail.status()).toBe(200);
      const thumbnailUrl = (await detail.json()).thumbnail_url;
      expect(thumbnailUrl).toMatch(/^\/api\/v1\/media\//);
      lastThumbnailUrl = thumbnailUrl;
      const thumbnail = await page.context().request.get(thumbnailUrl);
      expect(thumbnail.status()).toBe(200);
      expect(thumbnail.headers()["content-type"]).toContain("image/webp");
      if (attempt === 0) await page.getByRole("button", { name: "Remove cell image" }).click();
    }
    expect(assetIds[0]).not.toBe(assetIds[1]);

    await page.getByRole("button", { name: "Close cell editor" }).click();
    await page.getByRole("button", { name: "Finish creating →" }).click();
    const title = "Thumbnail image test";
    await page.getByLabel("Title").fill(title);
    await page.getByLabel("Bingo language").selectOption("en");
    await page.getByRole("button", { name: "Publish bingo" }).click();
    await expect(page.getByRole("heading", { name: "Cell editor" })).toBeVisible();
    await expect(page.locator(".form-message--error")).toContainText(
      "Describe this image-only cell before publishing.",
    );
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(page.getByLabel("Image description")).toBeVisible();
    await expect(page.getByLabel("Image description")).toBeFocused();
    await expect(page.getByLabel("Image description")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Image description")).toHaveAccessibleDescription(
      /Describe this image-only cell before publishing\./,
    );
    await page.getByLabel("Image description").fill("A small square sample image");
    await expect(page.getByLabel("Image description")).not.toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Close cell editor" }).click();
    await page.getByRole("button", { name: "Finish creating →" }).click();
    await page.getByRole("button", { name: "Publish bingo" }).click();
    await expect(page).toHaveURL(/\/bingo\/[0-9a-f-]+$/);
    await expect(
      page.getByRole("button", { name: "Image: A small square sample image" }),
    ).toBeVisible();
    const cellBackground = await page
      .locator(".play-cell__image")
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(cellBackground).toContain(lastThumbnailUrl);
    await page.goto("/discover");
    const card = page.locator(".bingo-card").filter({ hasText: title });
    await expect(card).toBeVisible();
    const previewImage = card.locator(".bingo-card-preview__image");
    await expect(previewImage).toHaveAttribute("src", lastThumbnailUrl);
    await expect(previewImage).toHaveAttribute("loading", "lazy");
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(previewImage).toHaveCSS("object-fit", "cover");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
  });

  test("image upload shows its stage and can be cancelled before retry", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    await page.getByRole("textbox", { name: "Text for row 1, column 1" }).press("Escape");
    await expect(page.getByRole("heading", { name: "Cell editor" })).toBeVisible();
    const input = page.getByLabel("Add image to cell");
    const applicationOrigin = new URL(page.url()).origin;
    let releaseStorage = () => {};
    let reportStorageRequest = () => {};
    const storageHeld = new Promise<void>((resolve) => {
      releaseStorage = resolve;
    });
    const storageRequested = new Promise<void>((resolve) => {
      reportStorageRequest = resolve;
    });
    await page.route("**/*", async (route) => {
      if (
        route.request().method() === "POST" &&
        new URL(route.request().url()).origin !== applicationOrigin
      ) {
        reportStorageRequest();
        await storageHeld;
        try {
          await route.fulfill({ status: 503, body: "Cancelled transfer" });
        } catch {
          // The browser may close the paused request when the user cancels it.
        }
        return;
      }
      await route.continue();
    });

    await input.setInputFiles({ name: "cell.png", mimeType: "image/png", buffer: cellImagePng });
    await storageRequested;
    await expect(page.getByText("Uploading image…")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    await page.getByRole("button", { name: "Cancel upload" }).click();
    releaseStorage();
    await expect(page.getByText("Upload cancelled.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove cell image" })).toHaveCount(0);

    await page.unroute("**/*");
    await input.setInputFiles({ name: "cell.png", mimeType: "image/png", buffer: cellImagePng });
    await expect(page.getByRole("button", { name: "Remove cell image" })).toBeVisible();
  });

  test("large image upload reports real byte progress, cancels and persists after retry", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "CDP transfer throttling requires Chromium.");
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await authenticateAs(page, "author");
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    const text = "Large upload progress and durable attachment 🎲";
    const cellText = page.getByRole("textbox", { name: "Text for row 1, column 1" });
    await cellText.fill(text);
    await expect(page).toHaveURL(/\/create\?bingo=[0-9a-f-]+$/);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await cellText.press("Escape");
    await expect(page.getByRole("heading", { name: "Cell editor" })).toBeVisible();
    const bingoId = new URL(page.url()).searchParams.get("bingo")!;
    socialFormBoards.set(page, bingoId);
    const body = largeImagePng();
    expect(body.length).toBeGreaterThan(3 * 1024 * 1024);
    expect(body.length).toBeLessThan(5 * 1024 * 1024);
    const file = { name: "большая картинка.png", mimeType: "image/png", buffer: body };
    const origin = new URL(page.url()).origin;
    let storageRequests = 0;
    let intentRequests = 0;
    let completeRequests = 0;
    const storageStatuses: number[] = [];
    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      const url = new URL(request.url());
      if (url.origin !== origin) storageRequests += 1;
      if (url.pathname === "/api/v1/uploads/intents/") intentRequests += 1;
    });
    page.on("response", (response) => {
      if (response.request().method() === "POST" && new URL(response.url()).origin !== origin) {
        storageStatuses.push(response.status());
      }
    });
    await page.evaluate(() => {
      const samples: number[] = [];
      const record = () => {
        const progress = document.querySelector<HTMLProgressElement>(".upload-status progress");
        if (progress?.hasAttribute("value")) {
          if (samples.at(-1) !== progress.value) samples.push(progress.value);
        }
      };
      const observer = new MutationObserver(record);
      observer.observe(document.body, { attributes: true, childList: true, subtree: true });
      Object.assign(window, { uploadProgressObservation: { samples, observer } });
    });
    const observedProgress = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              uploadProgressObservation: { samples: number[] };
            }
          ).uploadProgressObservation.samples,
      );
    let releaseComplete!: () => void;
    let reportComplete!: () => void;
    const heldComplete = new Promise<void>((resolve) => {
      releaseComplete = resolve;
    });
    const completeRequested = new Promise<void>((resolve) => {
      reportComplete = resolve;
    });
    let completeHandler: Promise<void> | undefined;
    const completeRoute = (route: Route) => {
      if (route.request().method() !== "POST") return route.continue();
      completeRequests += 1;
      completeHandler = (async () => {
        reportComplete();
        await heldComplete;
        await route.continue();
      })();
      return completeHandler;
    };
    await page.route("**/api/v1/uploads/*/complete/", completeRoute);
    const cdp = await page.context().newCDPSession(page);
    let storagePreflights = 0;
    cdp.on("Network.requestWillBeSent", (event) => {
      if (event.request.method === "OPTIONS" && new URL(event.request.url).origin !== origin) {
        storagePreflights += 1;
      }
    });
    await cdp.send("Network.enable");
    const progress = page.getByRole("progressbar", { name: "Uploading image…" });
    const input = page.getByLabel("Add image to cell");
    try {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 50,
        downloadThroughput: 10 * 1024 * 1024,
        uploadThroughput: 256 * 1024,
      });
      await input.setInputFiles(file);
      await expect
        .poll(async () => (await observedProgress()).filter((value) => value > 0 && value < 100))
        .not.toHaveLength(0);
      await expect(progress).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel upload" })).toBeEnabled();
      await page.getByRole("button", { name: "Cancel upload" }).click();
      await expect(page.getByText("Upload cancelled.")).toBeVisible();
      await expect(progress).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Remove cell image" })).toHaveCount(0);
      expect(completeRequests).toBe(0);
      expect(storageRequests).toBe(1);
      expect(intentRequests).toBe(1);

      await page.evaluate(() => {
        (
          window as unknown as { uploadProgressObservation: { samples: number[] } }
        ).uploadProgressObservation.samples.length = 0;
      });
      const retryStarted = Date.now();
      await input.setInputFiles(file);
      await expect
        .poll(async () => (await observedProgress()).filter((value) => value > 0 && value < 100))
        .not.toHaveLength(0);
      for (const width of [320, 1710]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(progress).toBeVisible();
        await expect(page.getByRole("button", { name: "Cancel upload" })).toBeEnabled();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
      await completeRequested;
      expect(Date.now() - retryStarted).toBeGreaterThan(8_000);
      const samples = await observedProgress();
      expect(samples.filter((value) => value > 0 && value < 100).length).toBeGreaterThan(2);
      // React can batch the final byte event with the transition to processing.
      expect(samples.every((value) => value >= 0 && value <= 100)).toBe(true);
      expect(samples.every((value, index) => index === 0 || value >= samples[index - 1]!)).toBe(
        true,
      );
      await expect(page.getByRole("progressbar", { name: "Processing image…" })).toBeVisible();
      await expect(
        page.getByRole("progressbar", { name: "Processing image…" }),
      ).not.toHaveAttribute("value");
      await expect(page.getByRole("button", { name: "Cancel upload" })).toBeEnabled();
      await expect(page.getByRole("button", { name: "Remove cell image" })).toHaveCount(0);
      expect(intentRequests).toBe(2);
      expect(storageRequests).toBe(2);
      expect(completeRequests).toBe(1);
      expect(storageStatuses).toEqual([204]);
      releaseComplete();
      await completeHandler;
      await expect(page.getByRole("button", { name: "Remove cell image" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(".upload-status")).toHaveCount(0);
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      const draft = await page.request.get(`/api/v1/bingos/${bingoId}/draft/`);
      expect(draft.status()).toBe(200);
      const saved = (await draft.json()) as BingoDraft;
      expect(saved.cells[0]?.text).toBe(text);
      expect(saved.cells[0]?.image?.status).toBe("ready");
      expect(saved.cells[0]?.image?.width).toBe(1024);
      expect(saved.cells[0]?.image?.height).toBe(1024);
      await page.reload();
      const cell = page.getByRole("gridcell").first();
      await expect(cell).toContainText(text);
      await expect(cell.locator(".editor-cell__image")).toBeVisible();
      expect(pageErrors).toEqual([]);
      await testInfo.attach("real-upload-progress", {
        body: JSON.stringify({ bytes: body.length, samples, storageStatuses, storagePreflights }),
        contentType: "application/json",
      });
    } finally {
      releaseComplete();
      await completeHandler;
      await page.unroute("**/api/v1/uploads/*/complete/", completeRoute);
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      await cdp.detach();
      await page.evaluate(() => {
        const observation = (
          window as unknown as { uploadProgressObservation?: { observer: MutationObserver } }
        ).uploadProgressObservation;
        observation?.observer.disconnect();
      });
    }
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

  test("catalog has no language picker and search fits narrow and wide screens", async ({
    page,
  }) => {
    const title = readLiveFixture().bingos.public.title;
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/discover");
      await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();
      await expect(page.getByRole("checkbox")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width + 1,
      );
    }

    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>((resolve) => {
      releaseScripts = resolve;
    });
    await page.route("**/_next/static/**/*.js", async (route) => {
      await scriptsReady;
      await route.continue();
    });
    await page.goto("/explore", { waitUntil: "commit" });
    const search = page.getByRole("searchbox", { name: "Search by title" });
    try {
      await expect(search).toBeVisible();
      await expect(search).toBeDisabled();
      await expect(page.getByRole("button", { name: "Search", exact: true })).toBeDisabled();
    } finally {
      releaseScripts();
    }
    await expect(search).toBeEnabled();
    await search.fill(title);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/search=/);
    await expect(page.locator(".bingo-card").filter({ hasText: title })).toBeVisible();
    await page.reload();
    await expect(search).toHaveValue(title);
    await expect(page.getByRole("group", { name: "Bingo languages" })).toHaveCount(0);
  });

  test("authenticated language, play, editor, and account settings pass the accessibility gate", async ({
    page,
  }) => {
    const fixture = readLiveFixture();
    await authenticateAs(page, "author");
    await page.goto("/discover");
    await expect(
      page.getByRole("heading", { name: "Which bingo languages do you prefer?" }),
    ).toHaveCount(0);
    await expectNoAccessibilityViolations(page);

    await page.goto(`/bingo/${fixture.bingos.public.id}`);
    await expect(page.locator("button.play-cell").first()).toBeEnabled();
    await expect(page.getByRole("heading", { name: fixture.bingos.public.title })).toBeVisible();
    await expect(page.getByRole("group", { name: "Mark cells with" })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.goto("/create");
    await page.getByRole("gridcell").first().click();
    await expect(page.getByRole("heading", { name: "Cell editor" })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
    await expectNoAccessibilityViolations(page);

    await authenticateAs(page, "player");
    await page.goto(`/bingo/${fixture.bingos.public.id}`);
    await expect(page.locator("button.play-cell").first()).toBeEnabled();
    await expect(page.getByRole("heading", { name: fixture.bingos.public.title })).toBeVisible();
    await page.getByRole("button", { name: "Report", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Report bingo" })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });

  test("report dialog locks background scrolling and restores it after Escape", async ({
    page,
  }) => {
    const bingo = readLiveFixture().bingos.public;
    await page.setViewportSize({ width: 390, height: 640 });
    await authenticateAs(page, "player");
    await page.goto(`/bingo/${bingo.id}`);
    await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();

    await page.getByRole("button", { name: "Report", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Report bingo" });
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.overflow))
      .toBe("hidden");
    const lockedScrollY = await page.evaluate(() => window.scrollY);
    await page.mouse.move(380, 600);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(lockedScrollY);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(lockedScrollY);
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

    page.once("dialog", (dialog) => void dialog.dismiss());
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByText(`1 of ${bingo.cell_ids.length} selected`)).toBeVisible();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(page.getByText(`0 of ${bingo.cell_ids.length} selected`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeDisabled();
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

  test("guest share validates nickname, submits with Enter, and retries one held write", async ({
    page,
  }) => {
    const bingo = readLiveFixture().bingos.public;
    const endpoint = `/api/v1/bingos/${bingo.id}/shares/`;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let writes = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const nickname = "  Гость 😀 <&>  ";
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      writes += 1;
      expect(route.request().postDataJSON().display_name).toBe(nickname.trim());
      if (writes === 1) {
        return route.fulfill({
          status: 503,
          json: { error: { code: "unavailable", message: "Sharing temporarily unavailable." } },
        });
      }
      await held;
      return route.continue();
    });
    try {
      await page.goto(`/bingo/${bingo.id}`);
      await expect(page.getByRole("heading", { name: bingo.title })).toBeVisible();
      await page.getByRole("button", { name: "Share result" }).click();
      const form = page.locator("form#share-result-panel");
      const name = form.getByLabel("Your nickname");
      const submit = form.getByRole("button", { name: "Create share link" });
      await expect(name).toHaveAttribute("required", "");
      await expect(name).toHaveAttribute("maxlength", "50");
      await expect(form.getByText("Required. Up to 50 characters.")).toBeVisible();
      await submit.click();
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute("aria-invalid", "true");
      await expect(form.getByRole("alert")).toHaveText(
        "Enter a nickname to create a guest share link.",
      );
      await name.fill("   ");
      await name.press("Enter");
      await expect(name).toBeFocused();
      await expect(form.getByRole("alert")).toBeVisible();
      expect(writes).toBe(0);
      await name.fill(nickname);
      const rejected = page.waitForResponse(
        (response) => response.url().endsWith(endpoint) && response.request().method() === "POST",
      );
      await name.press("Enter");
      expect((await rejected).status()).toBe(503);
      await expect(page.locator("main").getByRole("alert")).toHaveText(
        "Sharing temporarily unavailable.",
      );
      await expect(name).toHaveValue(nickname);
      await expect(submit).toBeEnabled();
      const created = page.waitForResponse(
        (response) => response.url().endsWith(endpoint) && response.request().method() === "POST",
      );
      await name.press("Enter");
      await expect.poll(() => writes).toBe(2);
      await expect(form.getByRole("button", { name: "Creating link…" })).toBeDisabled();
      await expect(form.getByRole("button", { name: "Cancel" })).toBeDisabled();
      await expect(name).toBeDisabled();
      await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
      expect(writes).toBe(2);
      for (const width of [320, 1710]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(form.getByRole("button", { name: "Creating link…" })).toBeInViewport();
      }
      release();
      expect((await created).status()).toBe(201);
      await expect(page).toHaveURL(new RegExp(`/share/${bingo.id}/[^/]+$`));
      await expect(page.getByText(`Shared by ${nickname.trim()}`)).toBeVisible();
      await page.reload();
      await expect(page.getByText(`Shared by ${nickname.trim()}`)).toBeVisible();
      expect(writes).toBe(2);
      expect(errors).toEqual([]);
    } finally {
      release();
    }
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

    const progressPath = `**/api/v1/progress/${bingo.id}/`;
    const blockReset = (route: Route) =>
      route.request().method() === "DELETE" ? route.abort("failed") : route.continue();
    await page.route(progressPath, blockReset);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(
      page.getByText("Unable to reach the service. Check your connection and try again."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `${bingo.cell_texts[2]}, selected` }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.unroute(progressPath, blockReset);

    page.once("dialog", (dialog) => void dialog.accept());
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

    const bingoLike = page.locator(".play-actions").getByRole("button", { name: /^Like ·/ });
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

  test("profile validation focuses the invalid field and preserves other edits", async ({
    page,
  }, testInfo) => {
    await authenticateAs(page, "author");
    await page.goto("/profile");
    const username = page.getByRole("textbox", { name: "Username" });
    const bio = page.getByRole("textbox", { name: "Bio" });
    const originalUsername = await username.inputValue();
    const originalBio = await bio.inputValue();
    await username.fill(readLiveFixture().users.player.username);
    await bio.fill("Keep this unsaved profile text 🎲");
    const rejectedPromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/v1/profiles/me/") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save profile" }).click();
    const rejected = await rejectedPromise;
    expect(rejected.status()).toBe(400);
    await expect(username).toHaveAttribute("aria-invalid", "true");
    await expect(username).toBeFocused();
    await expect(page.locator("#profile-username-error")).toHaveText(
      "This username is unavailable.",
    );
    await expect(bio).toHaveValue("Keep this unsaved profile text 🎲");
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      await username.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({ path: testInfo.outputPath(`profile-validation-${width}.png`) });
    }
    await username.fill(originalUsername);
    await expect(username).toHaveAttribute("aria-invalid", "false");
    await expect(page.locator("#profile-username-error")).toHaveCount(0);
    await bio.fill(originalBio);
    const saved = await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      page.getByRole("button", { name: "Save profile" }).click(),
    );
    expect(saved.status()).toBe(200);
    await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  });

  test("long URL and multilingual comments remain readable on narrow and wide screens", async ({
    page,
  }) => {
    const bingoId = readLiveFixture().bingos.public.id;
    const url = `https://example.invalid/${"long-segment-".repeat(55)}`;
    const body = `${url} 中文 🎲 Привет`;
    await authenticateAs(page, "player");
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/bingo/${bingoId}`);
    const composer = page.getByRole("textbox", { name: "Add a comment" });
    await expect(page.getByRole("button", { name: "Post comment" })).toBeDisabled();
    await composer.fill(body);
    await waitForResponse(page, `/api/v1/bingos/${bingoId}/comments/`, "POST", () =>
      page.getByRole("button", { name: "Post comment" }).click(),
    );
    const comment = page.locator(".comment-list article").filter({ hasText: url });
    await expect(comment).toContainText("中文 🎲 Привет");
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 800 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await expect(comment).toContainText(url);
    }
  });

  test("long account and bingo names respect input limits without widening the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/register");
    await page.getByLabel("Username").fill("u".repeat(100));
    await expect(page.getByLabel("Username")).toHaveValue("u".repeat(30));
    await expect(
      page.getByText("3–30 characters. Letters, numbers, and underscores."),
    ).toBeVisible();
    await page.getByLabel("Email").fill(`${"long".repeat(65)}@example.invalid`);
    expect((await page.getByLabel("Email").inputValue()).length).toBe(254);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );

    await authenticateAs(page, "author");
    await page.goto("/create");
    await page.getByRole("button", { name: "Finish creating →" }).click();
    await page.getByRole("textbox", { name: "Title" }).fill("T".repeat(200));
    await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("T".repeat(70));
    await expect(page.getByText("Up to 70 characters.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
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
    await expect(
      page.getByRole("heading", { name: "Confirm: Resolve without action" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: moderationReportId })).toBeVisible();
    await page.getByRole("button", { name: "Confirm resolve without action" }).click();
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
      "/bingo/not-a-uuid",
      "/share/11111111-1111-4111-8111-111111111111/missing",
      "/profile/notarealuserxy",
      "/foryoupage.html",
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
    await page.goto("/login");
    await page.getByLabel("Email").fill(fixture.users.author.email);
    await page.getByLabel("Password").fill(E2E_FIXTURE_PASSWORD);
    await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      page.getByRole("button", { name: "Log in" }).click(),
    );
    const secondTab = await page.context().newPage();
    await page.goto("/profile");
    await secondTab.goto("/discover");
    await secondTab.goto("/profile");
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expect(secondTab.getByRole("button", { name: "Log out" })).toBeVisible();

    await page.evaluate(() => {
      window.localStorage.setItem("not-enough-bingo:editor-recovery:v1:new", "old private draft");
    });
    await secondTab.evaluate(() => {
      window.sessionStorage.setItem("not-enough-bingo:progress-recovery:v1:test", "old progress");
    });
    await secondTab.getByRole("button", { name: "Log out" }).click();
    await expect(secondTab).toHaveURL(/\/login$/);
    expect((await secondTab.request.get("/api/v1/auth/me/")).status()).toBe(401);
    expect(
      await secondTab.evaluate(() =>
        window.sessionStorage.getItem("not-enough-bingo:progress-recovery:v1:test"),
      ),
    ).toBeNull();
    await secondTab.goBack();
    await expect(secondTab).toHaveURL(/\/discover$/);
    await secondTab.goto("/profile");
    await expect(
      secondTab.getByRole("heading", { name: "Log in to view your profile" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Log in", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(
      page.getByText("Your session ended. Log in again to continue where you left off."),
    ).toBeVisible();
    await expect(page.locator('a[href="/login"]')).toBeVisible();
    await page.getByRole("button", { name: "Close account dialog" }).click();
    await expect(page.getByRole("textbox", { name: "Bio", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save profile" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Log in to view your profile" })).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.localStorage.getItem("not-enough-bingo:editor-recovery:v1:new"),
      ),
    ).toBeNull();

    await secondTab.getByRole("link", { name: "Log in", exact: true }).last().click();
    await secondTab.getByLabel("Email").fill(fixture.users.player.email);
    await secondTab.getByLabel("Password").fill(E2E_FIXTURE_PASSWORD);
    await waitForResponse(secondTab, "/api/v1/auth/login/", "POST", () =>
      secondTab.getByRole("button", { name: "Log in" }).click(),
    );
    await expect(secondTab).toHaveURL(/\/profile$/);
    await expect(page.locator('a[href="/profile"]')).toBeVisible();
    await secondTab.close();
  });

  test("edits in two tabs require an explicit conflict resolution", async ({ page }) => {
    const bingoId = readLiveFixture().bingos.private.id;
    await authenticateAs(page, "author");
    const secondTab = await page.context().newPage();
    try {
      for (const tab of [page, secondTab]) {
        await tab.goto(`/create?bingo=${bingoId}`);
        await expect(tab.getByRole("heading", { name: "Edit bingo" })).toBeVisible();
        await tab.getByRole("button", { name: "Finish creating →" }).click();
        await expect(tab.getByLabel("Title")).toBeVisible();
      }

      const firstTitle = "E2E First Tab Draft";
      await waitForResponse(page, `/api/v1/bingos/${bingoId}/draft/`, "PUT", () =>
        page.getByLabel("Title").fill(firstTitle),
      );
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();

      const secondTitle = "E2E Second Tab Draft";
      const conflict = secondTab.waitForResponse(
        (response) =>
          response.url().includes(`/api/v1/bingos/${bingoId}/draft/`) &&
          response.request().method() === "PUT",
      );
      await secondTab.getByLabel("Title").fill(secondTitle);
      expect((await conflict).status()).toBe(412);
      await expect(secondTab.getByText("This draft was changed in another session.")).toBeVisible();
      await expect(secondTab.getByLabel("Title")).toHaveValue(secondTitle);

      await waitForResponse(secondTab, `/api/v1/bingos/${bingoId}/draft/`, "PUT", () =>
        secondTab.getByRole("button", { name: "Keep and save mine" }).click(),
      );
      await expect(secondTab.getByText("Saved", { exact: true })).toBeVisible();
      const draftResponse = await page.request.get(`/api/v1/bingos/${bingoId}/draft/`);
      expect(draftResponse.status()).toBe(200);
      await expect(draftResponse.json()).resolves.toMatchObject({ title: secondTitle });

      await page.reload();
      await page.getByRole("button", { name: "Finish creating →" }).click();
      await expect(page.getByLabel("Title")).toHaveValue(secondTitle);
    } finally {
      await secondTab.close();
    }
  });

  test("the same like from two tabs is counted once", async ({ page }) => {
    const bingo = readLiveFixture().bingos.public;
    await authenticateAs(page, "player");
    const likePath = `/api/v1/bingos/${bingo.id}/likes/`;
    const initialResponse = await page.request.get(`/api/v1/bingos/${bingo.id}/`);
    expect(initialResponse.status()).toBe(200);
    const initial = (await initialResponse.json()) as { liked_by_me: boolean };
    await page.goto(`/bingo/${bingo.id}`);
    const likedButton = page.locator(".play-actions").getByRole("button", { name: /^Liked ·/ });
    const likeButton = (tab: Page) =>
      tab.locator(".play-actions").getByRole("button", { name: /^Like ·/ });
    await expect(initial.liked_by_me ? likedButton : likeButton(page)).toBeVisible();
    if (initial.liked_by_me) {
      await waitForResponse(page, likePath, "DELETE", () => likedButton.click());
    }
    await expect(likeButton(page)).toBeVisible();
    const beforeResponse = await page.request.get(`/api/v1/bingos/${bingo.id}/`);
    expect(beforeResponse.status()).toBe(200);
    const before = (await beforeResponse.json()) as { stats: { likes: number } };

    const secondTab = await page.context().newPage();
    try {
      await secondTab.goto(`/bingo/${bingo.id}`);
      await expect(likeButton(secondTab)).toBeEnabled();
      await expect(likeButton(page)).toBeEnabled();
      const firstResponse = page.waitForResponse(
        (response) => response.url().includes(likePath) && response.request().method() === "POST",
      );
      const secondResponse = secondTab.waitForResponse(
        (response) => response.url().includes(likePath) && response.request().method() === "POST",
      );
      await Promise.all([likeButton(page).click(), likeButton(secondTab).click()]);
      expect([(await firstResponse).status(), (await secondResponse).status()].sort()).toEqual([
        200, 201,
      ]);

      const afterResponse = await page.request.get(`/api/v1/bingos/${bingo.id}/`);
      expect(afterResponse.status()).toBe(200);
      const after = (await afterResponse.json()) as { stats: { likes: number } };
      expect(after.stats.likes).toBe(before.stats.likes + 1);
      await page.reload();
      await expect(likedButton).toBeVisible();
    } finally {
      await secondTab.close();
    }
  });

  test("account export is prepared and downloads as a ZIP", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
    await page.getByRole("button", { name: "Request data export" }).click();
    const downloadLink = page.getByRole("link", { name: "Download data export" });
    await expect(downloadLink).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Your data export is ready to download.")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^not-enough-bingo-account_export-.*\.zip$/);
    const bytes = readFileSync((await download.path())!);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  test("account password validation identifies the field and keeps entered values", async ({
    page,
  }) => {
    await authenticateAs(page, "author");
    await page.goto("/profile");
    const form = page
      .locator("form.settings-card")
      .filter({ has: page.getByRole("heading", { name: "Change password", exact: true }) });
    const current = form.getByLabel("Current password", { exact: true });
    const next = form.getByLabel("New password", { exact: true });
    const validNewPassword = `${E2E_FIXTURE_PASSWORD}-Updated`;
    await current.fill("incorrect-password");
    await next.fill(validNewPassword);
    await form.getByLabel("Confirm new password", { exact: true }).fill(validNewPassword);
    const submit = async () => {
      const response = page.waitForResponse(
        (result) =>
          result.url().includes("/api/v1/auth/password-change/") &&
          result.request().method() === "POST",
      );
      await form.getByRole("button", { name: "Change password", exact: true }).click();
      return response;
    };

    const currentResponse = await submit();
    expect(currentResponse.status()).toBe(400);
    expect((await currentResponse.json()).error.details).toHaveProperty("current_password");
    await expect(current).toBeFocused();
    await expect(current).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByText("The current password is incorrect.")).toBeVisible();
    await expect(current).toHaveValue("incorrect-password");
    await expect(next).toHaveValue(validNewPassword);
    await expect(form.getByLabel("Confirm new password", { exact: true })).toHaveValue(
      validNewPassword,
    );

    await current.fill(E2E_FIXTURE_PASSWORD);
    await next.fill("password123456");
    await form.getByLabel("Confirm new password", { exact: true }).fill("password123456");
    await expect(form.getByText("The current password is incorrect.")).toHaveCount(0);
    const nextResponse = await submit();
    expect(nextResponse.status()).toBe(400);
    expect((await nextResponse.json()).error.details).toHaveProperty("new_password");
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByText("This password is too common.")).toBeVisible();
    await expect(current).toHaveValue(E2E_FIXTURE_PASSWORD);
    await expect(next).toHaveValue("password123456");
    await expect(form.getByLabel("Confirm new password", { exact: true })).toHaveValue(
      "password123456",
    );
  });

  test("avatar upload and removal persist after reload", async ({ page }) => {
    await authenticateAs(page, "author");
    await page.goto("/profile");
    const avatarCard = page
      .locator(".settings-card")
      .filter({ has: page.getByRole("heading", { name: "Avatar", exact: true }) });
    await avatarCard
      .getByLabel("Upload avatar", { exact: true })
      .setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: cellImagePng });
    await expect(avatarCard.getByRole("status")).toHaveText("Avatar updated.");
    await expect(avatarCard.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await page.reload();
    await expect(avatarCard.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    expect((await page.request.get("/api/v1/profiles/me/")).ok()).toBe(true);
    await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      avatarCard.getByRole("button", { name: "Remove", exact: true }).click(),
    );
    await expect(avatarCard.getByRole("status")).toHaveText("Avatar removed.");
    await page.reload();
    await expect(avatarCard.getByRole("heading", { name: "Avatar", exact: true })).toBeVisible();
    await expect(avatarCard.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    expect((await (await page.request.get("/api/v1/profiles/me/")).json()).avatar).toBeNull();
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

    // A reused QA mailbox can contain links from before the fixture was reseeded.
    const existingMessages = await request.get(`${mailpitBaseURL}/api/v1/messages?limit=100`);
    expect(existingMessages.ok()).toBeTruthy();
    const previousMessageIds = new Set(
      messageRows(await existingMessages.json()).flatMap((row) => {
        const id = row.ID ?? row.Id ?? row.id;
        return typeof id === "string" ? [id] : [];
      }),
    );
    await waitForResponse(page, "/api/v1/auth/password-reset/", "POST", () =>
      page.getByRole("button", { name: "Send reset link" }).click(),
    );
    await expect(page.getByRole("status")).toContainText("If an account exists");

    const link = new URL(await passwordResetLink(request, email, previousMessageIds));
    await page.goto(`${link.pathname}${link.search}`);
    await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill(nextPassword);
    await waitForResponse(page, "/api/v1/auth/password-reset/confirm/", "POST", () =>
      page.getByRole("button", { name: "Update password" }).click(),
    );
    await expect(page.getByRole("status")).toContainText("Password changed");
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue("");
    expect((await page.request.get("/api/v1/auth/me/")).status()).toBe(401);

    await page.goto(`${link.pathname}${link.search}`);
    await page.getByLabel("New password", { exact: true }).fill(nextPassword);
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue(nextPassword);
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

    // Hold an analytics request carrying the old session until password-change
    // rotates the cookie. Its late response must not erase the new session.
    let releaseAnalytics!: () => void;
    const heldAnalytics = new Promise<void>((resolve) => {
      releaseAnalytics = resolve;
    });
    let analyticsCaptured = false;
    await page.route("**/api/v1/interactions/", async (route) => {
      const headers = await route.request().allHeaders();
      analyticsCaptured = true;
      await heldAnalytics;
      const response = await route.fetch({ headers });
      expect(response.status()).toBe(202);
      expect(Boolean(response.headers()["set-cookie"]?.includes("neb_session="))).toBe(false);
      await route.fulfill({ response });
    });
    try {
      await page.goto("/profile");
      const changePassword = page
        .locator("form.settings-card")
        .filter({ has: page.getByRole("heading", { name: "Change password", exact: true }) });
      const changedPassword = `${nextPassword}-changed`;
      await changePassword.getByLabel("Current password", { exact: true }).fill(nextPassword);
      await changePassword.getByLabel("New password", { exact: true }).fill(changedPassword);
      await changePassword
        .getByLabel("Confirm new password", { exact: true })
        .fill(changedPassword);
      const sessions = page.locator(".settings-card").filter({
        has: page.getByRole("heading", { name: "Active sessions", exact: true }),
      });
      await expect(sessions.getByText("This device", { exact: true })).toBeVisible();
      await expect.poll(() => analyticsCaptured).toBe(true);
      await page.route("**/api/v1/auth/sessions/", (route) =>
        route.fulfill({
          status: 503,
          json: {
            error: { code: "unavailable", message: "Session details are temporarily unavailable." },
          },
        }),
      );
      await waitForResponse(page, "/api/v1/auth/password-change/", "POST", () =>
        changePassword.getByRole("button", { name: "Change password", exact: true }).click(),
      );
      await expect(changePassword.getByRole("status")).toContainText("Password changed");
      await expect(changePassword.getByRole("alert")).toHaveCount(0);
      await expect(changePassword.getByLabel("Current password", { exact: true })).toHaveValue("");
      await expect(sessions.getByRole("alert")).toContainText(
        "Session details are temporarily unavailable.",
      );
      await expect(sessions.getByText("This device", { exact: true })).toHaveCount(0);
      const analyticsResponse = page.waitForResponse((response) =>
        response.url().endsWith("/api/v1/interactions/"),
      );
      releaseAnalytics();
      await analyticsResponse;
      await page.unroute("**/api/v1/interactions/");
      await page.unroute("**/api/v1/auth/sessions/");
      await sessions.getByRole("button", { name: "Try again" }).click();
      await expect(sessions.getByText("This device", { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          async () => (await fetch("/api/v1/auth/me/", { credentials: "same-origin" })).status,
        ),
      ).toBe(200);
      await page.getByRole("button", { name: "Log out", exact: true }).click();
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(changedPassword);
      await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
        page.getByRole("button", { name: "Log in" }).click(),
      );
      await expect(page).toHaveURL(/\/discover$/);
    } finally {
      releaseAnalytics();
      await page.unroute("**/api/v1/interactions/");
    }
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
    await expect(page.getByLabel("Current password for email change")).toBeFocused();
    await expect(page.getByLabel("Current password for email change")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.getByText("The current password is incorrect.")).toBeVisible();

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
    await expect(page).toHaveURL(/\/confirm-email-change$/);
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
    await page.goto(`${link.pathname}${link.search}`);
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

  test("all image choosers support keyboard traversal and Enter with visible focus", async ({
    page,
    browserName,
  }) => {
    await authenticateAs(page, "author");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function openChooser(name: string) {
      const input = page.getByLabel(name, { exact: true });
      // Loaded activity inserts links before the avatar in the tab order.
      if (name === "Upload avatar") {
        await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-busy", "false");
      }
      await input.focus();
      // Safari uses Option+Tab to traverse all controls with its default settings.
      await page.keyboard.press(browserName === "webkit" ? "Alt+Shift+Tab" : "Shift+Tab");
      await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
      await expect(input).toBeFocused();
      expect(
        await input.evaluate((node) => getComputedStyle(node.closest("label")!).outlineWidth),
      ).toBe("3px");
      const chooser = page.waitForEvent("filechooser");
      await page.keyboard.press("Enter");
      await (await chooser).setFiles([]);
    }
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/create");
      await expect(page.getByRole("heading", { name: "Create bingo" })).toBeVisible();
      await openChooser("Upload background");
      await page.getByRole("gridcell").first().click();
      if (width === 320) await page.keyboard.press("Escape");
      await expect(page.getByRole("heading", { name: "Cell editor" })).toBeVisible();
      await openChooser("Add image to cell");
      await page.getByRole("button", { name: "Close cell editor" }).click();
      await page.getByRole("button", { name: "Finish creating" }).click();
      await openChooser("Choose file");
      await page.goto("/profile");
      await expect(page.getByRole("heading", { name: "Account settings" })).toBeVisible();
      await openChooser("Upload avatar");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    }
    expect(errors).toEqual([]);
  });

  test("unsaved profile changes warn before leaving and stop warning after saving", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await authenticateAs(page, "author");
    await page.goto("/explore");
    await page.getByRole("link", { name: /^Profile for/ }).click();
    const displayName = page.getByLabel("Display name", { exact: true });
    await expect(displayName).toBeVisible();
    const original = await displayName.inputValue();
    await displayName.fill("Unsaved profile example");
    await page.goBack();
    await expect(page).toHaveURL(/\/explore$/);
    await page.goForward();
    await expect(displayName).toHaveValue("Unsaved profile example");
    await expect(
      page.getByRole("status").filter({ hasText: "unsaved profile changes" }),
    ).toBeVisible();
    let confirmations = 0;
    page.on("dialog", async (dialog) => {
      confirmations += 1;
      expect(dialog.message()).toContain("have not been saved");
      await dialog.dismiss();
    });
    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(displayName).toHaveValue("Unsaved profile example");
    let releaseSave!: () => void;
    const heldSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await page.route("**/api/v1/profiles/me/", async (route) => {
      if (route.request().method() === "PATCH") await heldSave;
      await route.continue();
    });
    const saving = waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      page.getByRole("button", { name: "Save profile", exact: true }).click(),
    );
    try {
      await expect(page.getByRole("button", { name: "Saving profile…" })).toBeDisabled();
      await expect(displayName).toBeDisabled();
      await expect(displayName.locator("xpath=ancestor::form").getByRole("status")).toHaveText(
        "Saving changes…",
      );
    } finally {
      releaseSave();
    }
    await saving;
    await page.unroute("**/api/v1/profiles/me/");
    await expect(
      page.getByRole("heading", { name: "Unsaved profile example", level: 1 }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Explore", exact: true }).click();
    await expect(page).toHaveURL(/\/explore$/);
    expect(confirmations).toBe(1);
    await page.goto("/profile");
    await displayName.fill(original);
    await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      page.getByRole("button", { name: "Save profile", exact: true }).click(),
    );
  });
});

test("unsent comment draft survives client Back and Forward", async ({ page }, testInfo) => {
  const bingo = await createSocialFormBoard(page);
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Created", exact: true }).click();
  await page.locator(`a[href="/bingo/${bingo.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  const input = page.getByLabel("Add a comment", { exact: true });
  const text = "Keep my comment across Back 🎲\n<literal> & context";
  await input.fill(text);
  await page.goBack();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`/bingo/${bingo.id}$`));
  await expect(input).toHaveValue(text);
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 989 });
    await input.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    expect(
      (await new AxeBuilder({ page }).include(".comment-form--root").analyze()).violations,
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`restored-comment-${width}.png`) });
  }
});

test("unsent root comment returns after session recovery for the same account", async ({
  page,
}) => {
  const bingo = await createSocialFormBoard(page);
  await page.goto(`/bingo/${bingo.id}`);
  await expect(page.getByRole("link", { name: /^Profile for/ })).toBeVisible();
  const input = page.getByLabel("Add a comment", { exact: true });
  const text = "Keep my comment through reauthentication 🎲\n<literal> & context";
  await input.fill(text);
  await page.context().clearCookies();
  const expired = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/bingos/${bingo.id}/comments/`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  expect((await expired).status()).toBe(401);
  const login = page.getByRole("dialog", { name: "Log in", exact: true });
  await expect(login).toBeVisible();
  await login.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.author.email);
  await login.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
  await login.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(login).toHaveCount(0);
  await expect(input).toHaveValue(text);
  await expect(
    page.getByRole("status").filter({ hasText: "Unsent comment restored" }),
  ).toBeVisible();
});

test("explicit logout from another tab clears comment recovery even when storage is blocked", async ({
  page,
}) => {
  const bingo = await createSocialFormBoard(page);
  // Use a fresh session; fixture cookies must stay valid for later scenarios.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.author.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
  await page.goto(`/bingo/${bingo.id}`);
  const input = page.getByLabel("Add a comment", { exact: true });
  await input.fill("Private draft cleared by explicit sign-out 🎲");
  const settings = await page.context().newPage();
  try {
    await settings.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "neb:auth-sync") throw new Error("Cross-tab storage blocked by test");
        return setItem.call(this, key, value);
      };
    });
    await settings.goto("/profile");
    await settings.getByRole("button", { name: "Log out", exact: true }).click();
    const login = page.getByRole("dialog", { name: "Log in", exact: true });
    await expect(login).toBeVisible();
    await expect(input).toHaveCount(0);
    await login.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.author.email);
    await login.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
    await login.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(login).toHaveCount(0);
    await expect(input).toHaveValue("");
    await expect(
      page.getByRole("status").filter({ hasText: "Unsent comment restored" }),
    ).toHaveCount(0);
  } finally {
    await settings.close();
  }
});

test("disabled feedback tool assets stay out of normal account routes", async ({ page }) => {
  await authenticateAs(page, "author");
  const feedbackLoads: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/_next/static/chunks/") && path.includes("agentation"))
      feedbackLoads.push(path);
  });
  page.on("pageerror", (error) => errors.push(error.name));
  await page.goto("/explore");
  await page.getByRole("link", { name: /^Profile for/ }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
  expect(feedbackLoads).toEqual([]);
  expect(errors).toEqual([]);
});

for (const revalidation of ["focus", "pageshow"] as const) {
  for (const reauthenticateElsewhere of [false, true]) {
    test(`${revalidation} fallback clears comment recovery when both auth sync channels are unavailable (${reauthenticateElsewhere ? "after" : "before"} re-login)`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
      await page.context().addInitScript(() => {
        Object.defineProperty(window, "BroadcastChannel", { value: undefined, configurable: true });
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "neb:auth-sync") throw new Error("Auth storage unavailable in QA");
          return setItem.call(this, key, value);
        };
      });
      const bingo = await createSocialFormBoard(page);
      // Use a fresh session; fixture cookies must stay valid for later scenarios.
      await page.context().clearCookies();
      await page.goto("/login");
      await page.getByLabel("Email", { exact: true }).fill(readLiveFixture().users.author.email);
      await page.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await expect(page).toHaveURL(/\/discover$/);
      await page.goto(`/bingo/${bingo.id}`);
      const input = page.getByLabel("Add a comment", { exact: true });
      await expect(input).toBeVisible();
      await input.fill("Private draft cleared by explicit sign-out 🎲");
      const settings = await page.context().newPage();
      settings.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
      try {
        await settings.goto("/profile");
        await settings.getByRole("button", { name: "Log out", exact: true }).click();
        await expect(settings).toHaveURL(/\/login$/);
        const marker = (await page.context().cookies()).find(
          (cookie) => cookie.name === "neb_logout_event",
        );
        expect(marker?.httpOnly).toBe(true);
        expect(
          await page.evaluate(() =>
            document.cookie
              .split(";")
              .some((cookie) => cookie.trim().startsWith("neb_logout_event=")),
          ),
        ).toBe(false);
        if (reauthenticateElsewhere) {
          await settings
            .getByLabel("Email", { exact: true })
            .fill(readLiveFixture().users.author.email);
          await settings.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
          await settings.getByRole("button", { name: "Log in", exact: true }).click();
          await expect(settings).toHaveURL(/\/discover$/);
        }
        const focusCheck = page.waitForResponse((response) =>
          response.url().endsWith("/api/v1/auth/session/"),
        );
        if (revalidation === "focus") {
          await page.bringToFront();
          await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        } else {
          await page.evaluate(() =>
            window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
          );
        }
        expect((await focusCheck).status()).toBe(200);
        expect(await page.evaluate(() => typeof window.BroadcastChannel)).toBe("undefined");
        expect(
          await page.evaluate(() => {
            try {
              window.localStorage.setItem("neb:auth-sync", "probe");
              return false;
            } catch {
              return true;
            }
          }),
        ).toBe(true);
        const login = page.getByRole("dialog", { name: "Log in", exact: true });
        if (!reauthenticateElsewhere) {
          await expect(login).toBeVisible();
          await expect(input).toHaveCount(0);
          await login
            .getByLabel("Email", { exact: true })
            .fill(readLiveFixture().users.author.email);
          await login.getByLabel("Password", { exact: true }).fill(E2E_FIXTURE_PASSWORD);
          await login.getByRole("button", { name: "Log in", exact: true }).click();
        }
        await expect(login).toHaveCount(0);
        await expect(input).toHaveValue("");
        await expect(
          page.getByRole("status").filter({ hasText: "Unsent comment restored" }),
        ).toHaveCount(0);
        expect(errors).toEqual([]);
      } finally {
        await settings.close();
      }
    });
  }
}

test("profile saves silent filled values and retains them through field rejection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
  await authenticateAs(page, "author");
  const originalResponse = await page.request.get("/api/v1/profiles/me/");
  expect(originalResponse.status()).toBe(200);
  const original = (await originalResponse.json()) as {
    username: string;
    display_name: string;
    bio: string;
  };
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const filled = { display_name: "Тихое заполнение 🎲 <>&", bio: "界".repeat(495) + "\n🎲<&" };
  let reject = true;
  let writes = 0;
  await page.route("**/api/v1/profiles/me/", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    writes += 1;
    const body = route.request().postDataJSON() as Record<string, string>;
    expect(body.display_name).toBe(filled.display_name);
    expect(body.bio).toBe(filled.bio);
    if (reject) {
      await route.fulfill({
        status: 400,
        json: {
          error: {
            code: "validation_error",
            message: "Please check the highlighted fields.",
            details: { username: [{ code: "unique", message: "That username is unavailable." }] },
          },
        },
      });
    } else await route.continue();
  });
  try {
    await page.goto("/profile");
    const username = page.getByLabel("Username", { exact: true });
    const displayName = page.getByLabel("Display name", { exact: true });
    const bio = page.getByLabel("Bio", { exact: true });
    await expect(bio).toHaveAttribute("maxlength", "500");
    await displayName.evaluate((element, value) => {
      (element as HTMLInputElement).value = value;
    }, filled.display_name);
    await bio.evaluate((element, value) => {
      (element as HTMLTextAreaElement).value = value;
    }, filled.bio);
    await displayName.press("Enter");
    await expect(username).toHaveAttribute("aria-invalid", "true");
    await expect(username).toBeFocused();
    await expect(displayName).toHaveValue(filled.display_name);
    await expect(bio).toHaveValue(filled.bio);
    expect(writes).toBe(1);
    reject = false;
    await page.getByRole("button", { name: "Save profile", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Profile saved." })).toBeVisible();
    const saved = await page.request.get("/api/v1/profiles/me/");
    expect(saved.status()).toBe(200);
    const persisted = (await saved.json()) as { display_name: string; bio: string };
    expect(persisted.display_name).toBe(filled.display_name);
    expect(persisted.bio).toBe(filled.bio);
    expect(writes).toBe(2);
    expect(errors).toEqual([]);
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 989 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  } finally {
    await page.unroute("**/api/v1/profiles/me/");
    const restored = await page.request.patch("/api/v1/profiles/me/", {
      headers: { "X-CSRFToken": csrf!.value },
      data: { username: original.username, display_name: original.display_name, bio: original.bio },
    });
    expect(restored.status()).toBe(200);
  }
});

for (const scenario of [
  {
    heading: "Change password",
    path: "auth/password-change/",
    field: "Current password",
    submit: "Change password",
  },
  {
    heading: "Change email",
    path: "auth/email-change/",
    field: "Current password for email change",
    submit: "Send confirmation email",
  },
  {
    heading: "Delete account",
    path: "auth/account-deletion/",
    field: "Confirm with your password",
    submit: "Schedule account deletion",
  },
] as const) {
  test(`account ${scenario.heading.toLowerCase()} protects pending values and focuses rejected password`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
    await authenticateAs(page, "author");
    await page.goto("/profile");
    const form = page
      .locator("form")
      .filter({ has: page.getByRole("heading", { name: scenario.heading, exact: true }) });
    const password = form.getByLabel(scenario.field, { exact: true });
    const rejectedPassword = `Incorrect-${randomUUID()}`;
    await password.fill(rejectedPassword);
    if (scenario.heading === "Change password") {
      const replacement = `NewQa-${randomUUID()}!`;
      await form.getByLabel("New password", { exact: true }).fill(replacement);
      await form.getByLabel("Confirm new password", { exact: true }).fill(replacement);
    } else if (scenario.heading === "Change email") {
      await form
        .getByLabel("New email address", { exact: true })
        .fill(`qa-${randomUUID()}@example.test`);
    }
    let writes = 0;
    let release!: () => void;
    let received!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const responseReady = new Promise<void>((resolve) => {
      received = resolve;
    });
    await page.route(`**/api/v1/${scenario.path}`, async (route) => {
      writes += 1;
      if (scenario.heading === "Change email") {
        // Exercise the UI rejection in each engine without consuming the same
        // account's three-per-hour real email quota. Backend validation is
        // covered separately; the other credential cases forward real denials.
        received();
        await held;
        await route.fulfill({
          status: 400,
          json: {
            error: {
              code: "validation_error",
              message: "Please check the highlighted fields.",
              details: {
                current_password: [
                  { code: "invalid", message: "The current password is incorrect." },
                ],
              },
            },
          },
        });
      } else {
        const response = await route.fetch();
        expect(response.status()).toBe(400);
        received();
        await held;
        await route.fulfill({ response });
      }
    });
    try {
      if (scenario.heading === "Delete account") page.once("dialog", (dialog) => dialog.accept());
      await password.press("Enter");
      await responseReady;
      for (const input of await form.locator("input").all()) await expect(input).toBeDisabled();
      for (const toggle of await form.getByRole("button", { name: /^(Show|Hide)$/ }).all())
        await expect(toggle).toBeDisabled();
      await expect(form.locator('button[type="submit"]')).toBeDisabled();
      expect(writes).toBe(1);
      release();
      await expect(password).toBeEnabled();
      await expect(password).toHaveValue(rejectedPassword);
      await expect(password).toHaveAttribute("aria-invalid", "true");
      await expect(password).toHaveAttribute("aria-describedby", /.+/);
      await expect(password).toBeFocused();
      if (scenario.heading === "Delete account") {
        page.once("dialog", (dialog) => dialog.dismiss());
        await form.getByRole("button", { name: scenario.submit, exact: true }).click();
        expect(writes).toBe(1);
      }
      for (const width of [320, 1710]) {
        await page.setViewportSize({ width, height: 989 });
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
}

for (const selection of ["selected", "all"] as const) {
  test(`language preference failure retains ${selection} choices and protects dirty navigation`, async ({
    page,
  }) => {
    await authenticateAs(page, "author");
    const api = page.context().request;
    const originalResponse = await api.get("/api/v1/profiles/me/");
    expect(originalResponse.status()).toBe(200);
    const original = (await originalResponse.json()) as {
      preferred_languages: string[];
    };
    const csrf = (await api.storageState()).cookies.find((cookie) => cookie.name === "neb_csrf");
    expect(csrf).toBeDefined();
    const headers = { "X-CSRFToken": csrf!.value };
    const path = "/api/v1/profiles/me/";
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
    try {
      expect((await api.patch(path, { headers, data: { preferred_languages: ["en"] } })).ok()).toBe(
        true,
      );
      await page.route(`**${path}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        writes += 1;
        if (writes !== 1) return route.continue();
        await held;
        await route.fulfill({
          status: 503,
          json: {
            error: {
              code: "unavailable",
              message: "Language preferences temporarily unavailable.",
            },
          },
        });
      });
      await page.goto("/profile");
      const languages = page.getByRole("group", { name: "Preferred languages" });
      const english = languages.getByRole("checkbox", { name: "English", exact: true });
      const russian = languages.getByRole("checkbox", { name: "Russian", exact: true });
      await expect(english).toBeChecked();
      await (selection === "selected" ? russian : english).press("Space");
      const save = page.getByRole("button", { name: /^Sav(?:e|ing) languages/ });
      await save.click();
      await expect.poll(() => writes).toBe(1);
      await expect(
        page.getByRole("button", { name: "Saving languages…", exact: true }),
      ).toBeDisabled();
      await expect(english).toBeDisabled();
      await expect(russian).toBeDisabled();
      await save.evaluate((button: HTMLButtonElement) => button.click());
      expect(writes).toBe(1);
      release();
      const feedback = page.getByText("Language preferences temporarily unavailable.", {
        exact: true,
      });
      await expect(feedback).toBeVisible();
      await expect(english).toBeEnabled();
      if (selection === "selected") {
        await expect(english).toBeChecked();
        await expect(russian).toBeChecked();
      } else {
        await expect(languages.getByRole("checkbox", { checked: true })).toHaveCount(0);
      }
      let canceled = false;
      page.once("dialog", async (dialog) => {
        canceled = true;
        await dialog.dismiss();
      });
      await page.getByRole("link", { name: "Discover", exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
      expect(canceled).toBe(true);
      await expect(feedback).toBeVisible();
      for (const width of [320, 1710]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      const saved = await waitForResponse(page, path, "PATCH", () => save.click());
      expect(saved.status()).toBe(200);
      await expect(page.getByText("Bingo languages saved.", { exact: true })).toBeVisible();
      expect(writes).toBe(2);
      await page.reload();
      await expect(english).toBeEnabled();
      if (selection === "selected") {
        await expect(english).toBeChecked();
        await expect(russian).toBeChecked();
      } else {
        await expect(languages.getByRole("checkbox", { checked: true })).toHaveCount(0);
      }
      expect(errors).toEqual([]);
    } finally {
      release();
      expect(
        (
          await api.patch(path, {
            headers,
            data: { preferred_languages: original.preferred_languages },
          })
        ).ok(),
      ).toBe(true);
    }
  });
}

for (const preference of ["privacy", "notification"] as const) {
  test(`active ${preference} preference failure rolls back locally and retries without losing profile work`, async ({
    page,
  }) => {
    await authenticateAs(page, "author");
    const api = page.context().request;
    const profileResponse = await api.get("/api/v1/profiles/me/");
    expect(profileResponse.status()).toBe(200);
    const profile = (await profileResponse.json()) as {
      display_name: string;
      privacy: Record<string, boolean>;
    };
    const path =
      preference === "privacy"
        ? "/api/v1/profiles/me/privacy/"
        : "/api/v1/profiles/notification-preferences/";
    const method = preference === "privacy" ? "PUT" : "PATCH";
    const field = preference === "privacy" ? "show_bio" : "new_comment";
    const preferencesResponse = await api.get("/api/v1/profiles/notification-preferences/");
    expect(preferencesResponse.status()).toBe(200);
    const preferences = (await preferencesResponse.json()) as Record<string, boolean>;
    const original = preference === "privacy" ? profile.privacy : preferences;
    const originalValue = original[field];
    expect(typeof originalValue).toBe("boolean");
    const csrf = (await api.storageState()).cookies.find((cookie) => cookie.name === "neb_csrf");
    expect(csrf).toBeDefined();
    const headers = { "X-CSRFToken": csrf!.value };
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
    const failureMessage = `${preference} preferences temporarily unavailable.`;
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== method) return route.continue();
      writes += 1;
      if (writes !== 1) return route.continue();
      await held;
      await route.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message: failureMessage } },
      });
    });
    try {
      await page.goto("/profile");
      const displayName = page.getByLabel("Display name", { exact: true });
      const draft = "Unsaved preference regression draft";
      await displayName.fill(draft);
      const label = preference === "privacy" ? "Show bio" : "New comments on my bingos";
      const control = page.getByRole("checkbox", { name: label, exact: true });
      await expect(control).toBeEnabled();
      expect(await control.isChecked()).toBe(originalValue);
      await control.press("Space");
      await expect.poll(() => writes).toBe(1);
      expect(await control.isChecked()).toBe(!originalValue);
      await expect(control).toBeDisabled();
      await control.evaluate((checkbox: HTMLInputElement) => checkbox.click());
      expect(writes).toBe(1);
      const card = page.locator(".settings-card").filter({
        has: page.getByRole("heading", {
          name: preference === "privacy" ? "Privacy" : "Notification preferences",
          exact: true,
        }),
      });
      await expect(card.getByRole("status")).toHaveText(
        preference === "privacy" ? "Saving privacy settings…" : "Saving notification preferences…",
      );
      release();
      await expect(card.getByText(failureMessage, { exact: true })).toBeVisible();
      await expect(control).toBeEnabled();
      expect(await control.isChecked()).toBe(originalValue);
      await expect(displayName).toHaveValue(draft);
      const profileForm = page
        .locator("form.settings-card")
        .filter({ has: page.getByRole("heading", { name: "Profile details", exact: true }) });
      await expect(profileForm).toHaveCount(1);
      await expect(profileForm.getByText(failureMessage, { exact: true })).toHaveCount(0);
      for (const width of [320, 1710]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      const saved = await waitForResponse(page, path, method, () => control.press("Space"));
      expect(saved.status()).toBe(200);
      expect(await control.isChecked()).toBe(!originalValue);
      await expect(displayName).toHaveValue(draft);
      expect(writes).toBe(2);
      await displayName.fill(profile.display_name);
      await page.reload();
      await expect(control).toBeEnabled();
      expect(await control.isChecked()).toBe(!originalValue);
      expect(errors).toEqual([]);
    } finally {
      release();
      const restored = await api.fetch(path, { method, headers, data: original });
      expect(restored.ok()).toBe(true);
    }
  });
}

test("session sign-out shows scoped progress and retries without losing credential work", async ({
  page,
  playwright,
}) => {
  await authenticateAs(page, "author");
  const marker = `NEB isolated session ${randomUUID()}`;
  const secondary = await playwright.request.newContext({
    baseURL: test.info().project.use.baseURL,
    userAgent: marker,
  });
  let release: () => void = () => undefined;
  let targetId = "";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
  try {
    expect((await secondary.get("/api/v1/auth/csrf/")).ok()).toBe(true);
    const csrf = (await secondary.storageState()).cookies.find(
      (cookie) => cookie.name === "neb_csrf",
    );
    expect(csrf).toBeDefined();
    const fixture = readLiveFixture();
    expect(
      (
        await secondary.post("/api/v1/auth/login/", {
          headers: { "X-CSRFToken": csrf!.value },
          data: { email: fixture.users.author.email, password: E2E_FIXTURE_PASSWORD },
        })
      ).ok(),
    ).toBe(true);
    const sessionsResponse = await page.context().request.get("/api/v1/auth/sessions/");
    expect(sessionsResponse.ok()).toBe(true);
    const sessions = (await sessionsResponse.json()) as {
      results: { id: string; user_agent: string; current: boolean }[];
    };
    const target = sessions.results.find((item) => item.user_agent === marker);
    expect(target).toBeDefined();
    expect(target!.current).toBe(false);
    targetId = target!.id;
    const path = `/api/v1/auth/sessions/${targetId}/`;
    let writes = 0;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      writes += 1;
      if (writes !== 1) return route.continue();
      await held;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "unavailable",
            message: "Session revocation temporarily unavailable.",
          },
        },
      });
    });
    await page.goto("/profile");
    const section = page.locator(".settings-card").filter({
      has: page.getByRole("heading", { name: "Active sessions", exact: true }),
    });
    const row = section.getByRole("listitem").filter({ hasText: marker });
    await expect(row).toHaveCount(1);
    const destination = page.getByLabel("New email address", { exact: true });
    await destination.fill("unsent-session-test@example.test");
    const signOut = row.getByRole("button", { name: /^Sign(?:ing)? out/ });
    await signOut.press("Space");
    await expect.poll(() => writes).toBe(1);
    await expect(row.getByRole("button", { name: "Signing out…", exact: true })).toBeDisabled();
    await expect(section.getByRole("status")).toHaveText("Signing out session…");
    await signOut.evaluate((button: HTMLButtonElement) => button.click());
    expect(writes).toBe(1);
    release();
    await expect(section.getByRole("alert")).toContainText(
      "Session revocation temporarily unavailable.",
    );
    await expect(signOut).toBeEnabled();
    await expect(destination).toHaveValue("unsent-session-test@example.test");
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const response = await waitForResponse(page, path, "DELETE", () => signOut.press("Enter"));
    expect(response.status()).toBe(204);
    await expect(row).toHaveCount(0);
    await expect(section.getByRole("status")).toHaveText("Session signed out.");
    await expect(destination).toHaveValue("unsent-session-test@example.test");
    expect(writes).toBe(2);
    const revoked = await secondary.get("/api/v1/auth/session/");
    expect(revoked.status()).toBe(200);
    expect((await revoked.json()).user).toBeNull();
    targetId = "";
    expect(errors).toEqual([]);
  } finally {
    release();
    if (targetId) {
      const api = page.context().request;
      const csrf = (await api.storageState()).cookies.find((cookie) => cookie.name === "neb_csrf");
      expect(csrf).toBeDefined();
      const cleaned = await api.delete(`/api/v1/auth/sessions/${targetId}/`, {
        headers: { "X-CSRFToken": csrf!.value },
      });
      expect(cleaned.status()).toBe(204);
    }
    await secondary.dispose();
  }
});

test("isolated avatar validation blocks writes and the same file retries an intent outage", async ({
  page,
}) => {
  await authenticateAs(page, "moderator");
  const api = page.context().request;
  const bootstrapActor = await api.get("/api/v1/auth/me/");
  expect(bootstrapActor.status()).toBe(200);
  expect((await bootstrapActor.json()).id).toBe(readLiveFixture().users.moderator.id);
  const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
  const email = `e2e-avatar-${nonce}@example.test`;
  const password = `QA-${randomUUID()}-account`;
  let ownedId = "";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
  async function csrfHeaders() {
    const csrf = (await api.storageState()).cookies.find((cookie) => cookie.name === "neb_csrf");
    expect(csrf).toBeDefined();
    return { "X-CSRFToken": csrf!.value };
  }
  async function ownedProfile() {
    const identity = await api.get("/api/v1/auth/me/");
    expect(identity.status()).toBe(200);
    const actor = (await identity.json()) as { id: string; email: string };
    expect(actor.id).toBe(ownedId);
    expect(actor.email).toBe(email);
    const current = await api.get("/api/v1/profiles/me/");
    expect(current.status()).toBe(200);
    const profile = (await current.json()) as {
      id: string;
      avatar: { id: string } | null;
    };
    expect(profile.id).toBe(ownedId);
    return profile;
  }
  let releaseIntent: () => void = () => undefined;
  let heldHandler: Promise<void> | undefined;
  let intentWrites = 0;
  let profileWrites = 0;
  const submittedIntents: unknown[] = [];
  const heldIntent = new Promise<void>((resolve) => {
    releaseIntent = resolve;
  });
  const intentPath = "/api/v1/uploads/intents/";
  const intentRoute = async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (intentWrites !== 1) return route.continue();
    heldHandler = (async () => {
      await heldIntent;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "unavailable",
            message: "Avatar upload intent temporarily unavailable.",
          },
        },
      });
    })();
    return heldHandler;
  };
  try {
    expect((await api.get("/api/v1/auth/csrf/")).status()).toBe(200);
    expect(
      (
        await api.post("/api/v1/auth/register/", {
          headers: await csrfHeaders(),
          data: { email, username: `e2e_avatar_${nonce}`, password },
        })
      ).status(),
    ).toBe(202);
    const token = new URL(await verificationLink(api, email)).searchParams.get("token");
    expect(token).toBeTruthy();
    expect(
      (
        await api.post("/api/v1/auth/verify-email/", {
          headers: await csrfHeaders(),
          data: { token },
        })
      ).status(),
    ).toBe(200);
    // Drop only this browser's bootstrap cookies so logging in as the fresh
    // actor does not flush the persisted moderator fixture session.
    await page.context().clearCookies();
    expect((await api.get("/api/v1/auth/me/")).status()).toBe(401);
    expect((await api.get("/api/v1/auth/csrf/")).status()).toBe(200);
    expect(
      (
        await api.post("/api/v1/auth/login/", {
          headers: await csrfHeaders(),
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    const identity = await api.get("/api/v1/auth/me/");
    expect(identity.status()).toBe(200);
    const actor = (await identity.json()) as { id: string; email: string };
    expect(actor.email).toBe(email);
    expect(actor.id).toBeTruthy();
    expect(Object.values(readLiveFixture().users).map((user) => user.id)).not.toContain(actor.id);
    ownedId = actor.id;
    expect((await ownedProfile()).avatar).toBeNull();
    expect(
      (
        await api.patch("/api/v1/profiles/me/", {
          headers: await csrfHeaders(),
          data: { preferred_languages: ["en"] },
        })
      ).status(),
    ).toBe(200);
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path === intentPath && request.method() === "POST") {
        intentWrites += 1;
        submittedIntents.push(request.postDataJSON());
      }
      if (path === "/api/v1/profiles/me/" && request.method() === "PATCH") profileWrites += 1;
    });
    await page.route(`**${intentPath}`, intentRoute);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/profile");
    const avatarCard = page.locator(".settings-card").filter({
      has: page.getByRole("heading", { name: "Avatar", exact: true }),
    });
    const input = avatarCard.locator('input[name="avatar"]');
    for (const invalid of [
      {
        file: {
          name: "avatar.svg",
          mimeType: "image/svg+xml",
          buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        },
        message: "Use a JPEG, PNG, WebP, or AVIF image.",
      },
      {
        file: {
          name: "oversized.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
        },
        message: "The image must be no larger than 5 MB.",
      },
    ]) {
      await input.setInputFiles(invalid.file);
      await expect(avatarCard.getByRole("alert")).toHaveText(invalid.message);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(1);
      await expect(input).toBeEnabled();
      await expect(input).toHaveValue("");
      await expect(avatarCard.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
      expect((await ownedProfile()).avatar).toBeNull();
      expect(intentWrites).toBe(0);
      expect(profileWrites).toBe(0);
    }
    const valid = {
      name: "avatar-retry.png",
      mimeType: "image/png",
      buffer: cellImagePng,
    };
    const failedIntent = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === intentPath && response.request().method() === "POST",
    );
    await input.setInputFiles(valid);
    await expect.poll(() => intentWrites).toBe(1);
    await expect(input).toBeDisabled();
    await expect(input).toHaveValue("");
    expect(profileWrites).toBe(0);
    releaseIntent();
    expect((await failedIntent).status()).toBe(503);
    await expect(avatarCard.getByRole("alert")).toHaveText(
      "Avatar upload intent temporarily unavailable.",
    );
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue("");
    expect((await ownedProfile()).avatar).toBeNull();
    expect(profileWrites).toBe(0);

    // Reuse the identical name, MIME, and bytes; the input reset must allow reselection.
    const createdIntent = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === intentPath && response.request().method() === "POST",
    );
    const attached = waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      input.setInputFiles(valid),
    );
    const created = await createdIntent;
    expect(created.status()).toBe(201);
    const upload = (await created.json()) as { id: string };
    expect(upload.id).toBeTruthy();
    const attachment = await attached;
    expect(attachment.status()).toBe(200);
    expect(attachment.request().postDataJSON()).toEqual({
      avatar_id: upload.id,
    });
    expect(intentWrites).toBe(2);
    expect(submittedIntents).toEqual(
      [0, 1].map(() => ({
        kind: "avatar",
        file_name: valid.name,
        content_type: valid.mimeType,
        size: valid.buffer.length,
      })),
    );
    expect(profileWrites).toBe(1);
    await expect(avatarCard.getByRole("status")).toHaveText("Avatar updated.");
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue("");
    expect((await ownedProfile()).avatar?.id).toBe(upload.id);
    await page.reload();
    await expect(avatarCard.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    expect((await ownedProfile()).avatar?.id).toBe(upload.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const removed = await waitForResponse(page, "/api/v1/profiles/me/", "PATCH", () =>
      avatarCard.getByRole("button", { name: "Remove", exact: true }).click(),
    );
    expect(removed.status()).toBe(200);
    expect(removed.request().postDataJSON()).toEqual({ avatar_id: null });
    await expect(avatarCard.getByRole("status")).toHaveText("Avatar removed.");
    expect((await ownedProfile()).avatar).toBeNull();
    await page.reload();
    await expect(avatarCard.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
    expect((await ownedProfile()).avatar).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    releaseIntent();
    await heldHandler;
    await page.unroute(`**${intentPath}`, intentRoute);
    if (ownedId) {
      expect(
        (
          await api.post("/api/v1/auth/login/", {
            headers: await csrfHeaders(),
            data: { email, password },
          })
        ).status(),
      ).toBe(200);
      if ((await ownedProfile()).avatar) {
        expect(
          (
            await api.patch("/api/v1/profiles/me/", {
              headers: await csrfHeaders(),
              data: { avatar_id: null },
            })
          ).status(),
        ).toBe(200);
        expect((await ownedProfile()).avatar).toBeNull();
      }
      expect(
        (
          await api.post("/api/v1/auth/logout/", {
            headers: await csrfHeaders(),
          })
        ).status(),
      ).toBe(204);
    }
  }
});

test("confirmed account deletion signs out an isolated account and can be cancelled after login", async ({
  page,
  playwright,
}) => {
  await authenticateAs(page, "moderator");
  const api = page.context().request;
  const bootstrapActor = await api.get("/api/v1/auth/me/");
  expect(bootstrapActor.status()).toBe(200);
  expect((await bootstrapActor.json()).id).toBe(readLiveFixture().users.moderator.id);
  const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
  const email = `e2e-deletion-${nonce}@example.test`;
  const password = `QA-${randomUUID()}-account`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
  let ownedId = "";
  let revokedSession: APIRequestContext | undefined;
  async function csrfHeaders() {
    const csrf = (await api.storageState()).cookies.find((cookie) => cookie.name === "neb_csrf");
    expect(csrf).toBeDefined();
    return { "X-CSRFToken": csrf!.value };
  }
  async function ownedAccount() {
    const current = await api.get("/api/v1/auth/me/");
    expect(current.status()).toBe(200);
    const actor = (await current.json()) as {
      id: string;
      email: string;
      deletion_scheduled_for: string | null;
    };
    expect(actor.id).toBe(ownedId);
    expect(actor.email).toBe(email);
    return actor;
  }
  try {
    expect((await api.get("/api/v1/auth/csrf/")).status()).toBe(200);
    const registered = await api.post("/api/v1/auth/register/", {
      headers: await csrfHeaders(),
      data: { email, username: `e2e_deletion_${nonce}`, password },
    });
    expect(registered.status()).toBe(202);
    const link = new URL(await verificationLink(api, email));
    const token = link.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(
      (
        await api.post("/api/v1/auth/verify-email/", {
          headers: await csrfHeaders(),
          data: { token },
        })
      ).status(),
    ).toBe(200);
    // Drop only this browser's bootstrap cookies so logging in as the fresh
    // actor does not flush the persisted moderator fixture session.
    await page.context().clearCookies();
    expect((await api.get("/api/v1/auth/me/")).status()).toBe(401);
    expect((await api.get("/api/v1/auth/csrf/")).status()).toBe(200);
    expect(
      (
        await api.post("/api/v1/auth/login/", {
          headers: await csrfHeaders(),
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    const identity = await api.get("/api/v1/auth/me/");
    expect(identity.status()).toBe(200);
    const actor = (await identity.json()) as { id: string; email: string };
    expect(actor.email).toBe(email);
    expect(actor.id).toBeTruthy();
    expect(Object.values(readLiveFixture().users).map((user) => user.id)).not.toContain(actor.id);
    ownedId = actor.id;
    expect((await ownedAccount()).deletion_scheduled_for).toBeNull();
    expect(
      (
        await api.patch("/api/v1/profiles/me/", {
          headers: await csrfHeaders(),
          data: { preferred_languages: ["en"] },
        })
      ).status(),
    ).toBe(200);
    // Keep the original authenticated cookies to prove server-side revocation,
    // independently of the browser clearing its current session on sign-out.
    revokedSession = await playwright.request.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: await api.storageState(),
    });
    expect((await revokedSession.get("/api/v1/auth/me/")).status()).toBe(200);
    await page.goto("/profile");
    const section = page.locator("form.settings-card").filter({
      has: page.getByRole("heading", { name: "Delete account", exact: true }),
    });
    await section.getByLabel("Confirm with your password", { exact: true }).fill(password);
    const confirmation = page.waitForEvent("dialog");
    const scheduling = waitForResponse(page, "/api/v1/auth/account-deletion/", "POST", () =>
      section.getByRole("button", { name: "Schedule account deletion", exact: true }).click(),
    );
    const dialog = await confirmation;
    const confirmationType = dialog.type();
    const confirmationMessage = dialog.message();
    await dialog.accept();
    const scheduled = await scheduling;
    expect(confirmationType).toBe("confirm");
    expect(confirmationMessage).toBe(
      "Schedule account deletion? You can cancel during the grace period.",
    );
    expect(scheduled.status()).toBe(202);
    expect(scheduled.request().postDataJSON()).toEqual({ password });
    const deletion = (await scheduled.json()) as { status: string; scheduled_for: string };
    expect(deletion.status).toBe("scheduled");
    expect(Number.isFinite(Date.parse(deletion.scheduled_for))).toBe(true);
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile&reason=deletion-scheduled$/);
    await expect(
      page.getByText(
        "Account deletion is scheduled and all sessions were signed out. Log back in to review or cancel it during the grace period.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in", exact: true })).toBeVisible();
    expect((await api.get("/api/v1/auth/me/")).status()).toBe(401);
    expect((await revokedSession.get("/api/v1/auth/me/")).status()).toBe(401);

    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const loggedIn = await waitForResponse(page, "/api/v1/auth/login/", "POST", () =>
      page.getByRole("button", { name: "Log in", exact: true }).click(),
    );
    expect(loggedIn.status()).toBe(200);
    await expect(page).toHaveURL(/\/profile$/);
    expect((await ownedAccount()).deletion_scheduled_for).toBe(deletion.scheduled_for);
    await expect(section.locator("time")).toHaveAttribute("datetime", deletion.scheduled_for);
    const cancelled = await waitForResponse(page, "/api/v1/auth/account-deletion/", "DELETE", () =>
      section.getByRole("button", { name: "Cancel deletion", exact: true }).click(),
    );
    expect(cancelled.status()).toBe(204);
    await expect(section.getByRole("status")).toHaveText("Account deletion cancelled.");
    await expect(section.locator("time")).toHaveCount(0);
    await expect(section.getByLabel("Confirm with your password", { exact: true })).toHaveValue("");
    expect((await ownedAccount()).deletion_scheduled_for).toBeNull();
    await page.reload();
    await expect(section.getByLabel("Confirm with your password", { exact: true })).toBeVisible();
    await expect(section.getByRole("button", { name: "Cancel deletion", exact: true })).toHaveCount(
      0,
    );
    expect(errors).toEqual([]);
  } finally {
    try {
      if (ownedId) {
        expect(
          (
            await api.post("/api/v1/auth/login/", {
              headers: await csrfHeaders(),
              data: { email, password },
            })
          ).status(),
        ).toBe(200);
        const actor = await ownedAccount();
        if (actor.deletion_scheduled_for) {
          expect(
            (
              await api.delete("/api/v1/auth/account-deletion/", { headers: await csrfHeaders() })
            ).status(),
          ).toBe(204);
          expect((await ownedAccount()).deletion_scheduled_for).toBeNull();
        }
        expect(
          (await api.post("/api/v1/auth/logout/", { headers: await csrfHeaders() })).status(),
        ).toBe(204);
      }
    } finally {
      await revokedSession?.dispose();
    }
  }
});

test("deletion cancellation shows scoped progress and retries for an isolated account", async ({
  page,
}) => {
  const api = page.context().request;
  const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
  const email = `e2e-cancel-${nonce}@example.test`;
  const password = `QA-${randomUUID()}-account`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
  async function csrfHeaders() {
    const csrf = (await api.storageState()).cookies.find((cookie) => cookie.name === "neb_csrf");
    expect(csrf).toBeDefined();
    return { "X-CSRFToken": csrf!.value };
  }
  let release: () => void = () => undefined;
  let scheduled = false;
  try {
    expect((await api.get("/api/v1/auth/csrf/")).ok()).toBe(true);
    const registered = await api.post("/api/v1/auth/register/", {
      headers: await csrfHeaders(),
      data: { email, username: `e2e_cancel_${nonce}`, password },
    });
    expect(registered.status()).toBe(202);
    const link = new URL(await verificationLink(api, email));
    const token = link.searchParams.get("token");
    expect(token).toBeTruthy();
    expect(
      (
        await api.post("/api/v1/auth/verify-email/", {
          headers: await csrfHeaders(),
          data: { token },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await api.post("/api/v1/auth/login/", {
          headers: await csrfHeaders(),
          data: { email, password },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await api.patch("/api/v1/profiles/me/", {
          headers: await csrfHeaders(),
          data: { preferred_languages: ["en"] },
        })
      ).ok(),
    ).toBe(true);
    const path = "/api/v1/auth/account-deletion/";
    expect(
      (await api.post(path, { headers: await csrfHeaders(), data: { password } })).status(),
    ).toBe(202);
    scheduled = true;
    // Scheduling revokes every session; a new login during the grace period
    // owns cancellation. This account is separate from shared author fixtures.
    expect(
      (
        await api.post("/api/v1/auth/login/", {
          headers: await csrfHeaders(),
          data: { email, password },
        })
      ).ok(),
    ).toBe(true);
    let writes = 0;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**${path}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      writes += 1;
      if (writes !== 1) return route.continue();
      await held;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: "unavailable",
            message: "Deletion cancellation temporarily unavailable.",
          },
        },
      });
    });
    await page.goto("/profile");
    const section = page.locator("form.settings-card").filter({
      has: page.getByRole("heading", { name: "Delete account", exact: true }),
    });
    const cancel = section.getByRole("button", { name: /^(Cancel|Cancelling) deletion/ });
    await expect(cancel).toBeEnabled();
    await page
      .getByLabel("New email address", { exact: true })
      .fill("unsent-cancellation@example.test");
    await cancel.press("Space");
    await expect.poll(() => writes).toBe(1);
    await expect(
      section.getByRole("button", { name: "Cancelling deletion…", exact: true }),
    ).toBeDisabled();
    await expect(section.getByRole("status")).toHaveText("Cancelling account deletion…");
    await cancel.evaluate((button: HTMLButtonElement) => button.click());
    expect(writes).toBe(1);
    release();
    await expect(section.getByRole("alert")).toContainText(
      "Deletion cancellation temporarily unavailable.",
    );
    await expect(cancel).toBeEnabled();
    await expect(section.locator("time")).toHaveCount(1);
    await expect(page.getByLabel("New email address", { exact: true })).toHaveValue(
      "unsent-cancellation@example.test",
    );
    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const canceled = await waitForResponse(page, path, "DELETE", () => cancel.press("Enter"));
    expect(canceled.status()).toBe(204);
    scheduled = false;
    await expect(section.getByRole("status")).toHaveText("Account deletion cancelled.");
    await expect(section.getByLabel("Confirm with your password", { exact: true })).toBeVisible();
    expect(writes).toBe(2);
    await page.reload();
    await expect(page.getByLabel("Confirm with your password", { exact: true })).toBeVisible();
    const current = await api.get("/api/v1/auth/me/");
    expect(current.ok()).toBe(true);
    expect((await current.json()).deletion_scheduled_for).toBeNull();
    expect(errors).toEqual([]);
  } finally {
    release();
    if (scheduled) {
      expect(
        (
          await api.post("/api/v1/auth/login/", {
            headers: await csrfHeaders(),
            data: { email, password },
          })
        ).ok(),
      ).toBe(true);
      expect(
        (
          await api.delete("/api/v1/auth/account-deletion/", { headers: await csrfHeaders() })
        ).status(),
      ).toBe(204);
    }
  }
});

for (const mode of ["registration", "email-change"] as const) {
  test(`token-only ${mode} retries an outage with its original Mailpit link`, async ({ page }) => {
    const api = page.context().request;
    // The player session was revoked by an earlier credential test; setup needs a live actor.
    // Registration retry itself stays anonymous and keeps the unchanged verification quota.
    if (mode === "email-change") {
      await authenticateAs(page, "moderator");
      const actor = await api.get("/api/v1/auth/me/");
      expect(actor.status()).toBe(200);
      expect((await actor.json()).id).toBe(readLiveFixture().users.moderator.id);
    }
    const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
    const email = `e2e-token-${nonce}@example.test`;
    const password = `QA-${randomUUID()}-verification`;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
    async function csrfHeaders() {
      const cookie = (await api.storageState()).cookies.find((item) => item.name === "neb_csrf");
      expect(cookie).toBeDefined();
      return { "X-CSRFToken": cookie!.value };
    }
    expect((await api.get("/api/v1/auth/csrf/")).ok()).toBe(true);
    expect(
      (
        await api.post("/api/v1/auth/register/", {
          headers: await csrfHeaders(),
          data: { email, username: `e2e_token_${nonce}`, password },
        })
      ).status(),
    ).toBe(202);
    let link = new URL(await verificationLink(api, email));
    if (mode === "email-change") {
      const setupVerification = await api.post("/api/v1/auth/verify-email/", {
        headers: await csrfHeaders(),
        data: { token: link.searchParams.get("token") },
      });
      expect(setupVerification.status()).toBe(200);
      expect(
        (
          await api.post("/api/v1/auth/login/", {
            headers: await csrfHeaders(),
            data: { email, password },
          })
        ).ok(),
      ).toBe(true);
      const newEmail = `e2e-confirm-${nonce}@example.test`;
      expect(
        (
          await api.post("/api/v1/auth/email-change/", {
            headers: await csrfHeaders(),
            data: { new_email: newEmail, current_password: password },
          })
        ).status(),
      ).toBe(202);
      link = new URL(await emailChangeLink(api, newEmail));
    }
    const token = link.searchParams.get("token");
    expect(token).toBeTruthy();
    const endpoint =
      mode === "registration" ? "/api/v1/auth/verify-email/" : "/api/v1/auth/email-change/confirm/";
    const location = link.pathname + link.search;
    let writes = 0;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      expect(route.request().postDataJSON()).toEqual({ token });
      writes += 1;
      if (writes === 1) {
        return route.fulfill({
          status: 503,
          json: {
            error: { code: "unavailable", message: "Verification temporarily unavailable." },
          },
        });
      }
      if (writes === 2) await held;
      return route.continue();
    });
    try {
      await page.goto(location);
      const card = page.locator(".auth-card");
      await expect(card.getByRole("alert")).toHaveText("Verification temporarily unavailable.");
      expect(writes).toBe(1);
      expect(new URL(page.url()).searchParams.get("token")).toBe(token);
      const retry = card.getByRole("button", { name: "Retry", exact: true });
      await retry.focus();
      expect(await retry.evaluate((button) => getComputedStyle(button).outlineStyle)).not.toBe(
        "none",
      );
      await retry.press("Space");
      await expect.poll(() => writes).toBe(2);
      const pending = card.getByRole("button", { name: "Verifying…", exact: true });
      await expect(pending).toBeDisabled();
      await expect(card.getByRole("status")).toHaveText("Verifying…");
      await pending.evaluate((button: HTMLButtonElement) => button.click());
      expect(writes).toBe(2);
      for (const width of [320, 1710]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      const confirmed = page.waitForResponse(
        (response) => response.url().endsWith(endpoint) && response.request().method() === "POST",
      );
      release();
      expect((await confirmed).status()).toBe(mode === "registration" ? 200 : 204);
      await expect(
        card.getByRole("heading", {
          name: mode === "registration" ? "Email verified" : "Email changed",
        }),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${link.pathname}$`));
      expect(writes).toBe(2);
      // A separate actor checks reuse so the complete suite keeps the anonymous verification quota.
      if (mode === "registration") await authenticateAs(page, "author");
      const reused = page.waitForResponse(
        (response) => response.url().endsWith(endpoint) && response.request().method() === "POST",
      );
      await page.goto(location);
      expect((await reused).status()).toBe(400);
      await expect(card.getByRole("alert")).toContainText(/invalid|expired|used/i);
      await expect(card.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
      await expect(
        card.getByRole("link", {
          name: mode === "registration" ? /^register again$/i : /^Back to profile$/,
        }),
      ).toBeVisible();
      expect(writes).toBe(3);
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
}

test("editor text limits and native keyboard formatting persist after reload", async ({ page }) => {
  const errors: string[] = [];
  let publications = 0;
  page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}`));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/publish/")) publications += 1;
  });
  await authenticateAs(page, "author");
  await page.goto("/create");
  await page.getByRole("gridcell").first().click();
  await page.getByRole("textbox", { name: "Text for row 1, column 1" }).press("Escape");
  const text = "Привет🙂 <>&\n".repeat(7) + "123456789";
  expect(text).toHaveLength(100);
  const input = page.getByLabel("Text", { exact: true });
  await expect(input).toHaveAccessibleDescription("Up to 100 characters.");
  await waitForResponse(page, "/api/v1/drafts/", "POST", () => input.fill(text + "overflow"));
  await expect(input).toHaveValue(text);
  const id = new URL(page.url()).searchParams.get("bingo");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  for (const label of ["Bold", "Italic", "Underline", "Strikethrough"]) {
    const button = page.getByRole("button", { name: label, exact: true });
    await button.press("Space");
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  for (const control of [
    { label: "Background opacity", maximum: 100, final: 99 },
    { label: "Image opacity", maximum: 100, final: 98 },
    { label: "Border width", maximum: 12, final: 11 },
  ]) {
    const slider = page.getByRole("slider", { name: control.label });
    await slider.press("Home");
    await expect(slider).toHaveValue("0");
    await slider.press("ArrowLeft");
    await expect(slider).toHaveValue("0");
    await slider.press("End");
    await expect(slider).toHaveValue(String(control.maximum));
    await slider.press("ArrowRight");
    await expect(slider).toHaveValue(String(control.maximum));
    for (let step = control.maximum; step > control.final; step -= 1) {
      await slider.press("ArrowLeft");
    }
    await expect(slider).toHaveValue(String(control.final));
  }
  const border = page.getByRole("combobox", { name: "Border style", exact: true });
  await expect(border).toBeVisible();
  await border.press("d");
  await expect(border).toHaveValue("dashed");
  await border.press("Tab");
  await page.getByRole("button", { name: "Close cell editor" }).click();
  await page.getByRole("button", { name: "Finish creating →" }).click();
  const title = (`E2E limits ${randomUUID().slice(0, 8)} ` + "Т".repeat(70)).slice(0, 70);
  const description = "Описание🙂 <>&\n".repeat(40).slice(0, 499) + "Z";
  expect(description).toHaveLength(500);
  await page.getByLabel("Title", { exact: true }).fill(title + "overflow");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  const details = page.getByLabel("Description");
  await expect(details).toHaveAccessibleDescription("Up to 500 characters.");
  await details.fill(description + "overflow");
  await expect(details).toHaveValue(description);
  await page.getByLabel("Bingo language").selectOption("en");
  const tag = page.getByRole("textbox", { name: "Tag", exact: true });
  await expect(tag).toHaveAccessibleDescription("Up to 40 characters per tag.");
  await tag.fill("  MIXED_tag  ");
  await tag.press("Enter");
  await tag.fill("mixed_tag");
  await tag.press("Enter");
  const tags = page.getByRole("group", { name: "Selected tags" });
  await expect(tags.getByRole("button")).toHaveCount(1);
  const boundedTag = "я".repeat(40);
  await tag.fill(boundedTag + "overflow");
  await expect(tag).toHaveValue(boundedTag);
  await tag.press("Enter");
  const expectedTags = ["mixed_tag", boundedTag];
  for (let index = 0; index < 13; index += 1) {
    const value = `limit-${index}`;
    expectedTags.push(value);
    await tag.fill(value);
    await tag.press("Enter");
  }
  await expect(tags.getByRole("button")).toHaveCount(15);
  await tag.fill("one-too-many");
  await expect(page.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  await tag.press("Enter");
  await expect(tags.getByRole("button")).toHaveCount(15);
  expect(publications).toBe(0);
  await expect
    .poll(async () => {
      const response = await page.context().request.get(`/api/v1/bingos/${id}/draft/`);
      expect(response.ok()).toBe(true);
      const draft = (await response.json()) as BingoDraft;
      const cell = draft.cells.find((item) => item.row === 0 && item.column === 0);
      return {
        title: draft.title,
        description: draft.description,
        tags: draft.tags.map((item) => item.name),
        text: cell?.text,
        formats: [cell?.bold, cell?.italic, cell?.underline, cell?.strikethrough],
        background: cell?.background_opacity,
        image: cell?.image_opacity,
        border: cell?.border_width,
        style: cell?.border_style,
      };
    })
    .toEqual({
      title,
      description,
      tags: expectedTags,
      text,
      formats: [true, true, true, true],
      background: 0.99,
      image: 0.98,
      border: 11,
      style: "dashed",
    });
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("gridcell").first()).toBeVisible();
  await page.getByRole("gridcell").first().click();
  await page.getByRole("textbox", { name: "Text for row 1, column 1" }).press("Escape");
  await expect(input).toHaveValue(text);
  for (const label of ["Bold", "Italic", "Underline", "Strikethrough"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await expect(page.getByRole("slider", { name: "Background opacity" })).toHaveValue("99");
  await expect(page.getByRole("slider", { name: "Image opacity" })).toHaveValue("98");
  await expect(page.getByRole("slider", { name: "Border width" })).toHaveValue("11");
  await expect(border).toHaveValue("dashed");
  await page.getByRole("button", { name: "Close cell editor" }).click();
  await page.getByRole("button", { name: "Finish creating →" }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  await expect(details).toHaveValue(description);
  await expect(tags.getByRole("button")).toHaveCount(15);
  for (const width of [320, 1710]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  expect(publications).toBe(0);
  expect(errors).toEqual([]);
});
