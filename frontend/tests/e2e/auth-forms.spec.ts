import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' }),
  );
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
});

test("signup validates fields, reveals password, and submits with Enter", async ({ page }) => {
  let submissions = 0;
  await page.route("**/api/v1/auth/register/", (route) => {
    submissions += 1;
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: '{"status":"verification_required"}',
    });
  });

  await page.goto("/register");
  await page.getByLabel("Email").fill("invalid-email");
  await page.getByLabel("Username").fill("test_user");
  const password = page.getByLabel("Password");
  await password.fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  expect(submissions).toBe(0);
  expect(
    await page.getByLabel("Email").evaluate((input: HTMLInputElement) => input.validity.valid),
  ).toBe(false);

  await page.getByLabel("Email").fill("new-user@example.test");
  await page.getByRole("button", { name: "Create account" }).click();
  expect(submissions).toBe(0);
  expect(await password.evaluate((input: HTMLInputElement) => input.validity.tooShort)).toBe(true);

  await password.fill("long-safe-password");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("long-safe-password");
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(password).toHaveAttribute("type", "password");
  expect(
    await page.locator(".stack-form").evaluate((form: HTMLFormElement) => form.checkValidity()),
  ).toBe(true);
  await password.press("Enter");

  await expect(page).toHaveURL(/\/verify-email\?email=new-user%40example\.test$/);
  expect(submissions).toBe(1);
});

test("password controls fit and work on a narrow login screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/login");
  const password = page.getByLabel("Password");
  await password.fill("inspect-me");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(password).toHaveAttribute("type", "text");
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    showHeight: document.querySelector(".password-field button")?.getBoundingClientRect().height,
  }));
  expect(layout.pageWidth).toBe(layout.viewport);
  expect(layout.showHeight).toBeGreaterThanOrEqual(44);
});

test("a signed-in visitor leaves login for the requested page", async ({ page }) => {
  await page.unroute("**/api/v1/auth/session/");
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "existing-user", username: "existing_user" } }),
    }),
  );
  await page.route("**/api/v1/notifications/unread-count/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"count":0}' }),
  );

  await page.goto("/login?next=%2Fsupport%3Ffrom%3Dlogin%23contact");
  await expect(page).toHaveURL(/\/support\?from=login#contact$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toHaveCount(0);
});

test("a session check outage still leaves a usable login form", async ({ page }) => {
  await page.unroute("**/api/v1/auth/session/");
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );

  await page.goto("/login");
  await expect(page.getByRole("status")).toContainText("You can still try to log in.");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("verification does not claim a duplicate account received a new email", async ({ page }) => {
  await page.goto("/verify-email?email=existing%40example.test");
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText("If this registration is pending")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" }).last()).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "reset your password" })).toHaveAttribute(
    "href",
    "/forgot-password",
  );
});

for (const scenario of [
  {
    route: "/login",
    endpoint: "login/",
    fields: { email: "filled@example.test", password: "filled synthetic password" },
    expected: { email: "filled@example.test", password: "filled synthetic password" },
  },
  {
    route: "/register",
    endpoint: "register/",
    fields: {
      email: "filled@example.test",
      username: "filled_user",
      password: "filled synthetic password",
    },
    expected: {
      email: "filled@example.test",
      username: "filled_user",
      password: "filled synthetic password",
    },
  },
  {
    route: "/forgot-password",
    endpoint: "password-reset/",
    fields: { email: "filled@example.test" },
    expected: { email: "filled@example.test" },
  },
  {
    route: "/reset-password?uid=example-uid&token=example-token",
    endpoint: "password-reset/confirm/",
    fields: { new_password: "filled synthetic password" },
    expected: {
      uid: "example-uid",
      token: "example-token",
      new_password: "filled synthetic password",
    },
  },
]) {
  test(`actual filled input values survive rejection on ${scenario.route.split("?")[0]}`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.name));
    let submitted: unknown;
    await page.route(`**/api/v1/auth/${scenario.endpoint}`, (route) => {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Test submission rejected." }),
      });
    });
    await page.goto(scenario.route);
    const form = page.locator("form.stack-form");
    await expect(form).toBeVisible();
    for (const name of Object.keys(scenario.fields)) {
      await expect(form.locator(`input[name="${name}"]`)).toBeEnabled();
    }
    await form.evaluate((element: HTMLFormElement, fields) => {
      for (const [name, value] of Object.entries(fields)) {
        const input = element.elements.namedItem(name) as HTMLInputElement;
        input.value = value!;
      }
    }, scenario.fields);
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole("alert")).toHaveText("Test submission rejected.");
    expect(submitted).toEqual(scenario.expected);
    for (const [name, value] of Object.entries(scenario.fields)) {
      await expect(form.locator(`input[name="${name}"]`)).toHaveValue(value!);
    }
    expect(pageErrors).toEqual([]);
  });
}

for (const scenario of [
  {
    path: "/login?next=%2Fsupport",
    endpoint: "login/",
    fields: { email: "departure@example.test", password: "Departure-Password!2026" },
    status: 200,
  },
  {
    path: "/register",
    endpoint: "register/",
    fields: {
      email: "departure@example.test",
      username: "departure_user",
      password: "Departure-Password!2026",
    },
    status: 202,
  },
  {
    path: "/forgot-password",
    endpoint: "password-reset/",
    fields: { email: "departure@example.test" },
    status: 200,
  },
  {
    path: "/reset-password?uid=departure-uid&token=departure-token",
    endpoint: "password-reset/confirm/",
    fields: { new_password: "Departure-Password!2026" },
    status: 200,
  },
]) {
  test(`departed ${scenario.endpoint} response preserves the new route and search`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1710, height: 900 });
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      username: "departure_user",
      display_name: "Departure User",
      avatar: null,
      email: "departure@example.test",
      email_verified: true,
      deletion_scheduled_for: null,
    };
    let signedIn = false;
    await page.unroute("**/api/v1/auth/session/");
    await page.route("**/api/v1/auth/session/", (route) =>
      route.fulfill({ json: { user: signedIn ? user : null } }),
    );
    await page.route("**/api/v1/notifications/unread-count/", (route) =>
      route.fulfill({ json: { count: 0 } }),
    );
    await page.route("**/api/v1/bingos/?*", (route) =>
      route.fulfill({ json: { count: 0, next: null, previous: null, results: [] } }),
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const endpoint = `/api/v1/auth/${scenario.endpoint}`;
    await page.route(`**${endpoint}`, async (route) => {
      writes += 1;
      await held;
      if (scenario.endpoint === "login/") signedIn = true;
      await route.fulfill({
        status: scenario.status,
        json: scenario.endpoint === "login/" ? { user } : { status: "verification_required" },
      });
    });
    try {
      const sessionReady = page.waitForResponse("**/api/v1/auth/session/");
      await page.goto(scenario.path);
      await sessionReady;
      const form = page.locator("form.stack-form");
      await expect(form).toBeVisible();
      for (const [name, value] of Object.entries(scenario.fields)) {
        await form.locator(`input[name="${name}"]`).fill(value!);
      }
      for (const [name, value] of Object.entries(scenario.fields)) {
        await expect(form.locator(`input[name="${name}"]`)).toHaveValue(value!);
      }
      const submit = form.locator('button[type="submit"]');
      const before = await submit.boundingBox();
      const formBefore = await form.boundingBox();
      await submit.click();
      await expect.poll(() => writes).toBe(1);
      await expect(submit).toBeDisabled();
      const pending = await submit.boundingBox();
      expect(pending?.height).toBe(before?.height);
      expect(pending?.y).toBe(before?.y);
      expect((await form.boundingBox())?.height).toBe(formBefore?.height);
      await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
      expect(writes).toBe(1);
      await page.locator("header").getByRole("link", { name: "Explore", exact: true }).click();
      await expect(page).toHaveURL(/\/explore$/);
      const search = page.getByRole("searchbox", { name: "Search by title" });
      await search.fill("retained");
      await search.press("Enter");
      await expect(page).toHaveURL(/\/explore\?search=retained$/);
      await page.evaluate(() => {
        window.location.hash = "catalog";
      });
      const response = page.waitForResponse(
        (item) => item.url().endsWith(endpoint) && item.request().method() === "POST",
      );
      release();
      expect((await response).status()).toBe(scenario.status);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
      if (scenario.endpoint === "login/") {
        await expect(page.getByRole("link", { name: "Profile for Departure User" })).toBeVisible();
      }
      await expect(page).toHaveURL(/\/explore\?search=retained#catalog$/);
      await expect(search).toHaveValue("retained");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(writes).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      release();
    }
  });
}

for (const width of [320, 1710]) {
  test(`verification Retry and Resend exclude pending duplicate writes at ${width}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    const email = "pending-verification@example.test";
    const token = "synthetic-original-verification-token";
    const verificationURL = `/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
    const writes: { path: string; body: unknown }[] = [];
    const completions: Promise<void>[] = [];
    const unexpectedWrites: string[] = [];
    let releaseResend!: () => void;
    let releaseRetry!: () => void;
    const heldResend = new Promise<void>((resolve) => {
      releaseResend = resolve;
    });
    const heldRetry = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const apiPattern = "**/api/v1/**";
    const mockBackend = async (route: import("@playwright/test").Route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "GET" && path === "/api/v1/auth/session/") {
        return route.fulfill({ json: { user: null } });
      }
      if (request.method() === "GET" && path === "/api/v1/auth/csrf/") {
        return route.fulfill({ json: { csrf: "synthetic-csrf" } });
      }
      if (["/api/v1/client-errors/", "/api/v1/interactions/"].includes(path)) {
        return route.fulfill({ status: 204 });
      }
      if (
        ![
          "/api/v1/auth/register/",
          "/api/v1/auth/resend-verification/",
          "/api/v1/auth/verify-email/",
        ].includes(path)
      ) {
        if (!["GET", "HEAD"].includes(request.method())) unexpectedWrites.push(path);
        return route.fulfill({ status: 503, json: {} });
      }
      writes.push({ path, body: request.postDataJSON() });
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-csrftoken"]).toBe("synthetic-csrf");
      if (path === "/api/v1/auth/register/") {
        return route.fulfill({ status: 202, json: { status: "verification_required" } });
      }
      if (path === "/api/v1/auth/resend-verification/") {
        const attempt = writes.filter((write) => write.path === path).length;
        if (attempt === 1) await heldResend;
        return route.fulfill({
          status: attempt === 1 ? 503 : 202,
          json: { detail: "Resend unavailable." },
        });
      }
      if (path === "/api/v1/auth/verify-email/") {
        if (writes.filter((write) => write.path === path).length === 2) await heldRetry;
        return route.fulfill({ status: 503, json: { detail: "Verification unavailable." } });
      }
      // Unexpected API calls also stay local to this test.
      return route.fulfill({ status: 503, json: {} });
    };
    await page.route(apiPattern, (route) => {
      const completion = mockBackend(route);
      completions.push(completion);
      return completion;
    });
    const noOverflow = async () =>
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
    try {
      const sessionReady = page.waitForResponse("**/api/v1/auth/session/");
      await page.goto("/register");
      expect((await sessionReady).status()).toBe(200);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Username").fill("pending_verification");
      await page.getByLabel("Password").fill("Synthetic-Password!2026");
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page).toHaveURL(/\/verify-email\?email=pending-verification%40example\.test$/);
      await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
      await page.goto(verificationURL);
      const card = page.locator(".auth-card");
      const retry = card.locator("button.button--primary");
      const resend = card.locator("button.button--secondary");
      await expect(card.getByRole("alert")).toHaveText("Verification unavailable.");
      await expect(retry).toHaveText("Retry");
      await expect(resend).toBeEnabled();
      await noOverflow();
      await retry.focus();
      // macOS WebKit requires Option-Tab to traverse all buttons.
      await page.keyboard.press(
        browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
      );
      await expect(resend).toBeFocused();
      await page.keyboard.press("Space");
      await expect.poll(() => writes.length).toBe(3);
      for (const button of [retry, resend]) await expect(button).toBeDisabled();
      await expect(resend).toHaveText("Sending…");
      await card
        .locator("button")
        .evaluateAll((buttons) =>
          buttons.forEach((button) => (button as HTMLButtonElement).click()),
        );
      await noOverflow();
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(verificationURL);
      expect(writes).toHaveLength(3);
      releaseResend();
      await expect(card.getByRole("alert")).toHaveText("Resend unavailable.");
      for (const button of [retry, resend]) await expect(button).toBeEnabled();
      await retry.focus();
      await page.keyboard.press("Space");
      await expect.poll(() => writes.length).toBe(4);
      for (const button of [retry, resend]) await expect(button).toBeDisabled();
      await expect(retry).toHaveText("Verifying…");
      await card
        .locator("button")
        .evaluateAll((buttons) =>
          buttons.forEach((button) => (button as HTMLButtonElement).click()),
        );
      await noOverflow();
      expect(writes).toHaveLength(4);
      expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(verificationURL);
      releaseRetry();
      await expect(card.getByRole("alert")).toHaveText("Verification unavailable.");
      for (const button of [retry, resend]) await expect(button).toBeEnabled();
      expect(new URL(page.url()).searchParams.get("token")).toBe(token);
      await resend.click();
      await expect(card.getByRole("status")).toContainText("If this registration is pending");
      await expect(card.getByRole("alert")).toHaveCount(0);
      await expect(retry).toHaveCount(0);
      await expect(resend).toBeEnabled();
      expect(writes[0]).toEqual({
        path: "/api/v1/auth/register/",
        body: {
          email,
          username: "pending_verification",
          password: "Synthetic-Password!2026",
        },
      });
      expect(unexpectedWrites).toEqual([]);
      expect(writes.slice(1)).toEqual([
        { path: "/api/v1/auth/verify-email/", body: { token } },
        { path: "/api/v1/auth/resend-verification/", body: { email } },
        { path: "/api/v1/auth/verify-email/", body: { token } },
        { path: "/api/v1/auth/resend-verification/", body: { email } },
      ]);
      await noOverflow();
      expect(errors).toEqual([]);
    } finally {
      releaseResend();
      releaseRetry();
      try {
        await Promise.all(completions);
      } finally {
        await page.unroute(apiPattern);
      }
    }
  });
}
