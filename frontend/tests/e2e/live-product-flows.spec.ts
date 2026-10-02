import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext, BrowserContext, Page, Response, Route } from "@playwright/test";
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
const socialFormBoards = new WeakMap<Page, string>();

test.afterEach(async ({ page }) => {
  const id = socialFormBoards.get(page);
  if (!id) return;
  await authenticateAs(page, "author");
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "neb_csrf");
  expect(csrf).toBeDefined();
  const removed = await page.context().request.delete(`/api/v1/bingos/${id}/`, {
    headers: { "X-CSRFToken": csrf!.value },
  });
  expect(removed.status()).toBe(204);
  socialFormBoards.delete(page);
});

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
    await page.getByLabel("Image description").fill("A small square sample image");
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
    await current.fill("incorrect-password");
    await next.fill("password123456");
    await form.getByLabel("Confirm new password", { exact: true }).fill("password123456");
    const submit = async () => {
      const response = page.waitForResponse(
        (result) =>
          result.url().includes("/api/v1/auth/password-change/") &&
          result.request().method() === "POST",
      );
      await form.getByRole("button", { name: "Change password", exact: true }).click();
      return response;
    };

    expect((await submit()).status()).toBe(400);
    await expect(current).toBeFocused();
    await expect(current).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByText("The current password is incorrect.")).toBeVisible();
    await expect(next).toHaveValue("password123456");

    await current.fill(E2E_FIXTURE_PASSWORD);
    await expect(form.getByText("The current password is incorrect.")).toHaveCount(0);
    expect((await submit()).status()).toBe(400);
    await expect(next).toBeFocused();
    await expect(next).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByText("This password is too common.")).toBeVisible();
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
    await expect(page).toHaveURL(/\/reset-password$/);
    await expect(page.getByLabel("New password", { exact: true })).toHaveValue("");
    expect((await page.request.get("/api/v1/auth/me/")).status()).toBe(401);

    await page.goto(`${link.pathname}${link.search}`);
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

    await page.goto("/profile");
    const changePassword = page
      .locator("form.settings-card")
      .filter({ has: page.getByRole("heading", { name: "Change password", exact: true }) });
    const changedPassword = `${nextPassword}-changed`;
    await changePassword.getByLabel("Current password", { exact: true }).fill(nextPassword);
    await changePassword.getByLabel("New password", { exact: true }).fill(changedPassword);
    await changePassword.getByLabel("Confirm new password", { exact: true }).fill(changedPassword);
    await waitForResponse(page, "/api/v1/auth/password-change/", "POST", () =>
      changePassword.getByRole("button", { name: "Change password", exact: true }).click(),
    );
    await expect(changePassword.getByRole("status")).toContainText("Password changed");
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

  test("all image choosers work with Tab and Enter and show focus", async ({ page }) => {
    await authenticateAs(page, "author");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function openChooser(name: string) {
      const input = page.getByLabel(name, { exact: true });
      await input.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
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
