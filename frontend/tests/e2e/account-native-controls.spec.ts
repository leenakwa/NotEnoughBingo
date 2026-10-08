import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

// Real AccountSettings controls with explicitly injected API responses. These
// cases establish browser behavior, not server persistence or password validity.
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "native_account",
  display_name: "Native Account",
  avatar: null,
  email: "native-account@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};
const profile = {
  ...user,
  bio: "",
  follower_count: 0,
  following_count: 0,
  is_following: false,
  preferred_languages: ["en"],
  language_preferences_confirmed: true,
  privacy: {
    show_bio: true,
    show_created_bingos: true,
    show_play_history: true,
    show_shared_results: true,
    show_followers: true,
    show_following: true,
  },
};
const emptyPage = { count: 0, next: null, previous: null, results: [] };

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/interactions/") {
      expect(route.request().method()).toBe("POST");
      return route.fulfill({ status: 204, body: "" });
    }
    expect(route.request().method(), `Unexpected account mutation of ${path}`).toBe("GET");
    if (path === "/api/v1/auth/session/") return route.fulfill({ json: { user } });
    if (path === "/api/v1/auth/me/") return route.fulfill({ json: user });
    if (path === "/api/v1/auth/csrf/") return route.fulfill({ json: { csrf: "test" } });
    if (path === "/api/v1/profiles/me/") return route.fulfill({ json: profile });
    if (path === "/api/v1/profiles/notification-preferences/") {
      return route.fulfill({
        json: {
          new_comment: true,
          comment_reply: true,
          bingo_like: true,
          comment_like: true,
          new_follower: true,
          marketing_email: false,
        },
      });
    }
    if (path === "/api/v1/notifications/unread-count/") {
      return route.fulfill({ json: { count: 0 } });
    }
    if (path.startsWith("/api/v1/profiles/") || path === "/api/v1/auth/sessions/") {
      return route.fulfill({ json: emptyPage });
    }
    throw new Error(`Unexpected account test request: ${path}`);
  });
});

function accountForm(page: Page, heading: string) {
  return page.locator("form.settings-card").filter({
    has: page.getByRole("heading", { name: heading, exact: true }),
  });
}

async function openAccount(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const pageViewRecorded = page.waitForResponse("**/api/v1/interactions/");
  await page.goto("/profile");
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue(user.username);
  for (const heading of ["Change email", "Change password", "Delete account"]) {
    await expect(accountForm(page, heading).locator('button[type="submit"]')).toBeEnabled();
  }
  // Complete analytics before a short case tears down the controlled routes.
  expect((await pageViewRecorded).status()).toBe(204);
}

async function expectInvalid(
  input: Locator,
  validity: "valueMissing" | "typeMismatch" | "tooShort",
) {
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((element: HTMLInputElement, key) => element.validity[key], validity),
  ).toBe(true);
}

async function expectKeyboardFocus(control: Locator) {
  await expect(control).toBeFocused();
  const style = await control.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      visible: element.matches(":focus-visible"),
      style: computed.outlineStyle,
      width: Number.parseFloat(computed.outlineWidth),
    };
  });
  expect(style.visible).toBe(true);
  expect(style.style).not.toBe("none");
  expect(style.width).toBeGreaterThanOrEqual(2);
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBe(dimensions.viewport);
}

async function expectFormOwnership(form: Locator, names: string[]) {
  const controls = await form.evaluate((element: HTMLFormElement) =>
    Array.from(element.querySelectorAll<HTMLInputElement>("input")).map((input) => ({
      name: input.name,
      ownForm: input.form === element,
    })),
  );
  expect(controls).toEqual(names.map((name) => ({ name, ownForm: true })));
}

function heldValidation(fields: Record<string, string>) {
  const requests: Record<string, string>[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const handle = async (route: Route) => {
    expect(route.request().method()).toBe("POST");
    requests.push(route.request().postDataJSON());
    try {
      await held;
      await route.fulfill({
        status: 422,
        json: {
          error: {
            code: "validation_error",
            message: "Please review your account details.",
            details: Object.fromEntries(
              Object.entries(fields).map(([field, message]) => [
                field,
                [{ message, code: "invalid" }],
              ]),
            ),
          },
        },
      });
    } finally {
      finish();
    }
  };
  return { requests, release, finished, handle };
}

async function expectPendingGuard(page: Page, form: Locator, requests: unknown[]) {
  for (const heading of ["Change email", "Change password", "Delete account"]) {
    const controls = accountForm(page, heading).locator("input, button");
    for (const control of await controls.all()) await expect(control).toBeDisabled();
  }
  await page.keyboard.press("Enter");
  await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
  expect(requests).toHaveLength(1);
  await expectNoOverflow(page);
}

for (const width of [320, 1710]) {
  test(`account email native constraints, keyboard, and raw FormData at ${width}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const dialogs: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", async (dialog) => {
      dialogs.push(dialog.type());
      await dialog.accept();
    });
    const validation = heldValidation({ current_password: "This current password is incorrect." });
    const endpoint = "**/api/v1/auth/email-change/";
    await page.route(endpoint, validation.handle);
    try {
      await openAccount(page, width);
      const form = accountForm(page, "Change email");
      const email = form.getByLabel("New email address", { exact: true });
      const password = form.getByLabel("Current password for email change", { exact: true });
      const show = form.locator('.password-field__control button[type="button"]');
      const submit = form.locator('button[type="submit"]');
      await expectFormOwnership(form, ["new_email", "email-change-password"]);

      await submit.click();
      await expectInvalid(email, "valueMissing");
      await email.fill("not-an-email");
      await submit.click();
      await expectInvalid(email, "typeMismatch");
      await email.fill("valid@example.test");
      await submit.click();
      await expectInvalid(password, "valueMissing");
      expect(validation.requests).toEqual([]);

      const mixedCaseEmail = "MiXeD.Account+Native@Example.TEST";
      const rawPassword = "  c  ";
      await email.fill(`  ${mixedCaseEmail}  `);
      await password.fill(rawPassword);
      // type=email sanitizes outer whitespace in the real DOM, preserving case.
      await expect(email).toHaveValue(mixedCaseEmail);
      await email.focus();
      await page.keyboard.press("Tab");
      await expectKeyboardFocus(password);
      await page.keyboard.press("Tab");
      await expectKeyboardFocus(show);
      await page.keyboard.press("Enter");
      await expect(password).toHaveAttribute("type", "text");
      await page.keyboard.press("Space");
      await expect(password).toHaveAttribute("type", "password");
      await expect(password).toHaveValue(rawPassword);
      expect(validation.requests).toEqual([]);
      await page.keyboard.press("Tab");
      await expectKeyboardFocus(submit);
      expect(
        await form.evaluate((element: HTMLFormElement) =>
          Object.fromEntries(new FormData(element).entries()),
        ),
      ).toEqual({ new_email: mixedCaseEmail, "email-change-password": rawPassword });
      await password.press("Enter");
      await expect.poll(() => validation.requests.length).toBe(1);
      expect(validation.requests).toEqual([
        { new_email: mixedCaseEmail, current_password: rawPassword },
      ]);
      await expect(submit).toHaveText("Sending…");
      await expectPendingGuard(page, form, validation.requests);
      validation.release();
      await validation.finished;
      await expect(form.getByRole("alert")).toHaveText("This current password is incorrect.");
      await expect(password).toBeFocused();
      await expect(password).toHaveAttribute("aria-invalid", "true");
      await expect(email).toHaveValue(mixedCaseEmail);
      await expect(password).toHaveValue(rawPassword);
      await password.fill(`${rawPassword}x`);
      await expect(form.getByRole("alert")).toHaveCount(0);

      // Observe existing reload behavior of transient account fields; this does
      // not prescribe a dirty-form policy or establish backend persistence.
      const reloadedPageView = page.waitForResponse("**/api/v1/interactions/");
      await page.reload();
      expect((await reloadedPageView).status()).toBe(204);
      await expect(
        accountForm(page, "Change email").locator('button[type="submit"]'),
      ).toBeEnabled();
      await expect(accountForm(page, "Change email").getByLabel("New email address")).toHaveValue(
        "",
      );
      await expect(
        accountForm(page, "Change email").getByLabel("Current password for email change"),
      ).toHaveValue("");
      expect(dialogs).toEqual([]);
      expect(validation.requests).toHaveLength(1);
      await expectNoOverflow(page);
      expect(errors).toEqual([]);
    } finally {
      validation.release();
      if (validation.requests.length) await validation.finished;
      await page.unroute(endpoint, validation.handle);
    }
  });

  test(`account password native lengths, mismatch focus, and raw passwords at ${width}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Return fields in reverse order to verify rendered form order determines focus.
    const validation = heldValidation({
      new_password: "Choose a different new password.",
      current_password: "This current password is incorrect.",
    });
    const endpoint = "**/api/v1/auth/password-change/";
    await page.route(endpoint, validation.handle);
    try {
      await openAccount(page, width);
      const form = accountForm(page, "Change password");
      const current = form.getByLabel("Current password", { exact: true });
      const next = form.getByLabel("New password", { exact: true });
      const confirmation = form.getByLabel("Confirm new password", { exact: true });
      const shows = form.locator('.password-field__control button[type="button"]');
      const submit = form.locator('button[type="submit"]');
      await expectFormOwnership(form, ["current_password", "new_password", "confirm-new-password"]);
      await submit.click();
      await expectInvalid(current, "valueMissing");
      const rawCurrent = "  c  ";
      await current.fill(rawCurrent);
      await submit.click();
      await expectInvalid(next, "valueMissing");
      await next.pressSequentially("NewSecret!1");
      await submit.click();
      await expectInvalid(next, "tooShort");
      await next.pressSequentially("2");
      await expect(next).toHaveValue("NewSecret!12");
      await submit.click();
      await expectInvalid(confirmation, "valueMissing");
      await confirmation.pressSequentially("OtherSecret");
      await submit.click();
      await expectInvalid(confirmation, "tooShort");
      await confirmation.pressSequentially("1");
      await expect(confirmation).toHaveValue("OtherSecret1");
      await submit.click();
      await expect(form.getByRole("alert")).toHaveText("The new passwords do not match.");
      await expect(confirmation).toBeFocused();
      await expect(confirmation).toHaveAttribute("aria-invalid", "true");
      expect(validation.requests).toEqual([]);

      const rawNew = "  NativeSecret!12  ";
      await next.fill(rawNew);
      await confirmation.fill(rawNew);
      await expect(form.getByRole("alert")).toHaveCount(0);
      await current.focus();
      for (const control of [
        shows.nth(0),
        next,
        shows.nth(1),
        confirmation,
        shows.nth(2),
        submit,
      ]) {
        await page.keyboard.press("Tab");
        await expectKeyboardFocus(control);
      }
      await shows.nth(1).focus();
      await shows.nth(1).press("Enter");
      await expect(next).toHaveAttribute("type", "text");
      await shows.nth(1).press("Space");
      await expect(next).toHaveAttribute("type", "password");
      expect(validation.requests).toEqual([]);
      expect(
        await form.evaluate((element: HTMLFormElement) =>
          Object.fromEntries(new FormData(element).entries()),
        ),
      ).toEqual({
        current_password: rawCurrent,
        new_password: rawNew,
        "confirm-new-password": rawNew,
      });
      await confirmation.press("Enter");
      await expect.poll(() => validation.requests.length).toBe(1);
      expect(validation.requests).toEqual([{ current_password: rawCurrent, new_password: rawNew }]);
      await expect(submit).toHaveText("Changing…");
      await expectPendingGuard(page, form, validation.requests);
      validation.release();
      await validation.finished;
      await expect(current).toBeFocused();
      await expect(current).toHaveAttribute("aria-invalid", "true");
      await expect(next).toHaveAttribute("aria-invalid", "true");
      await expect(form.getByRole("alert")).toHaveCount(2);
      await expect(current).toHaveValue(rawCurrent);
      await expect(next).toHaveValue(rawNew);
      await expect(confirmation).toHaveValue(rawNew);
      await current.fill(`${rawCurrent}x`);
      await expect(current).not.toHaveAttribute("aria-invalid", "true");
      await expect(next).toHaveAttribute("aria-invalid", "true");
      await expect(form.getByRole("alert")).toHaveText("Choose a different new password.");
      expect(validation.requests).toHaveLength(1);
      await expectNoOverflow(page);
      expect(errors).toEqual([]);
    } finally {
      validation.release();
      if (validation.requests.length) await validation.finished;
      await page.unroute(endpoint, validation.handle);
    }
  });

  test(`account deletion native required, keyboard confirmation, and dismissal at ${width}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const dialogs: { type: string; message: string }[] = [];
    let accept = false;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("dialog", async (dialog) => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      if (accept) await dialog.accept();
      else await dialog.dismiss();
    });
    const validation = heldValidation({ password: "This deletion password is incorrect." });
    const endpoint = "**/api/v1/auth/account-deletion/";
    await page.route(endpoint, validation.handle);
    try {
      await openAccount(page, width);
      const form = accountForm(page, "Delete account");
      const password = form.getByLabel("Confirm with your password", { exact: true });
      const show = form.locator('.password-field__control button[type="button"]');
      const submit = form.locator('button[type="submit"]');
      await expectFormOwnership(form, ["deletion_password"]);
      await password.press("Enter");
      await expectInvalid(password, "valueMissing");
      expect(dialogs).toEqual([]);
      expect(validation.requests).toEqual([]);

      // A current/deletion credential is required without a new-password minimum.
      const rawPassword = "  d  ";
      await password.fill(rawPassword);
      expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(true);
      await password.focus();
      await page.keyboard.press("Tab");
      await expectKeyboardFocus(show);
      await page.keyboard.press("Enter");
      await expect(password).toHaveAttribute("type", "text");
      await page.keyboard.press("Space");
      await expect(password).toHaveAttribute("type", "password");
      expect(dialogs).toEqual([]);
      expect(validation.requests).toEqual([]);
      await page.keyboard.press("Tab");
      await expectKeyboardFocus(submit);
      await password.press("Enter");
      await expect.poll(() => dialogs.length).toBe(1);
      await expect(password).toHaveValue(rawPassword);
      await expect(submit).toBeEnabled();
      expect(validation.requests).toEqual([]);

      accept = true;
      await password.press("Enter");
      await expect.poll(() => validation.requests.length).toBe(1);
      expect(validation.requests).toEqual([{ password: rawPassword }]);
      await expect(submit).toHaveText("Scheduling…");
      await expectPendingGuard(page, form, validation.requests);
      expect(dialogs).toEqual([
        {
          type: "confirm",
          message: "Schedule account deletion? You can cancel during the grace period.",
        },
        {
          type: "confirm",
          message: "Schedule account deletion? You can cancel during the grace period.",
        },
      ]);
      validation.release();
      await validation.finished;
      await expect(form.getByRole("alert")).toHaveText("This deletion password is incorrect.");
      await expect(password).toBeFocused();
      await expect(password).toHaveAttribute("aria-invalid", "true");
      await expect(password).toHaveValue(rawPassword);
      await expect(submit).toBeEnabled();
      await password.fill(`${rawPassword}x`);
      await expect(form.getByRole("alert")).toHaveCount(0);
      expect(validation.requests).toHaveLength(1);
      await expectNoOverflow(page);
      expect(errors).toEqual([]);
    } finally {
      validation.release();
      if (validation.requests.length) await validation.finished;
      await page.unroute(endpoint, validation.handle);
    }
  });
}
