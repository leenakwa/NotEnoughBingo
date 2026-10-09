import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

// These browser cases exercise the real ProfileView with explicitly injected API
// responses. They do not establish persistence, clipboard, or autofill behavior.
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "native_profile",
  display_name: "Native Profile",
  avatar: null,
  email: "native-profile@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};
const profile = {
  ...user,
  bio: "Initial bio",
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
type ProfileField = "username" | "display_name" | "bio";
const fieldDetails: Record<ProfileField, { label: string; hint: string; error: string }> = {
  username: {
    label: "Username",
    hint: "3–30 characters. Letters, numbers, and underscores.",
    error: "This username is already taken.",
  },
  display_name: {
    label: "Display name",
    hint: "Optional. Up to 80 characters.",
    error: "This display name is unavailable.",
  },
  bio: {
    label: "Bio",
    hint: "Optional. Up to 500 characters.",
    error: "Please revise this bio.",
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/v1/interactions/") {
      expect(route.request().method()).toBe("POST");
      return route.fulfill({ status: 204, body: "" });
    }
    expect(route.request().method(), `Unexpected mutation of ${path}`).toBe("GET");
    if (path === "/api/v1/auth/session/") return route.fulfill({ json: { user } });
    if (path === "/api/v1/auth/me/") return route.fulfill({ json: user });
    if (path === "/api/v1/auth/csrf/") return route.fulfill({ json: { csrf: "test" } });
    if (path === "/api/v1/profiles/me/") return route.fulfill({ json: profile });
    if (path === "/api/v1/profiles/notification-preferences/") {
      return route.fulfill({
        json: { comments: true, likes: true, follows: true, system: true },
      });
    }
    if (path === "/api/v1/notifications/unread-count/") {
      return route.fulfill({ json: { count: 0 } });
    }
    if (path.startsWith("/api/v1/profiles/") || path === "/api/v1/auth/sessions/") {
      return route.fulfill({ json: emptyPage });
    }
    throw new Error(`Unexpected profile test request: ${path}`);
  });
});

function profileForm(page: Page) {
  return page.locator("form.settings-card").filter({
    has: page.getByRole("heading", { name: "Profile details", exact: true }),
  });
}

async function openProfile(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const pageViewRecorded = page.waitForResponse("**/api/v1/interactions/");
  await page.goto("/profile");
  const form = profileForm(page);
  await expect(form.getByLabel("Username", { exact: true })).toHaveValue(user.username);
  await expect(form.getByRole("button", { name: "Save profile", exact: true })).toBeEnabled();
  // Drain the actual page-view request before any short case can tear down its routes.
  expect((await pageViewRecorded).status()).toBe(204);
  return form;
}

async function expectNoOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(width.content).toBe(width.viewport);
}

async function expectInvalid(
  input: Locator,
  validity: "valueMissing" | "tooShort" | "patternMismatch",
) {
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((element: HTMLInputElement, key) => element.validity[key], validity),
  ).toBe(true);
}

function heldValidation(fields: readonly ProfileField[]) {
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
    if (route.request().method() !== "PATCH") return route.fallback();
    requests.push(route.request().postDataJSON());
    try {
      await held;
      await route.fulfill({
        status: 422,
        json: {
          error: {
            code: "validation_error",
            message: "Please review your profile details.",
            details: Object.fromEntries(
              fields.map((field) => [
                field,
                [{ message: fieldDetails[field].error, code: "invalid" }],
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

for (const width of [320, 1710]) {
  test(`profile native constraints, Tab, Enter, and pending controls at ${width}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const validation = heldValidation(["username"]);
    const endpoint = "**/api/v1/profiles/me/";
    await page.route(endpoint, validation.handle);
    try {
      const form = await openProfile(page, width);
      const username = form.getByLabel("Username", { exact: true });
      const name = form.getByLabel("Display name", { exact: true });
      const bio = form.getByLabel("Bio", { exact: true });
      const submit = form.locator('button[type="submit"]');

      await username.fill("");
      await submit.click();
      await expectInvalid(username, "valueMissing");
      await username.pressSequentially("ab");
      await submit.click();
      await expectInvalid(username, "tooShort");
      await username.fill("bad-name");
      await submit.click();
      await expectInvalid(username, "patternMismatch");
      expect(validation.requests).toEqual([]);

      await username.fill("");
      await username.pressSequentially("a".repeat(31));
      await expect(username).toHaveValue("a".repeat(30));
      await expect(username).toHaveAttribute("minlength", "3");
      await expect(username).toHaveAttribute("maxlength", "30");
      await name.fill("");
      await name.pressSequentially("N".repeat(81));
      await expect(name).toHaveValue("N".repeat(80));
      await expect(name).toHaveAttribute("maxlength", "80");
      await bio.fill("");
      await bio.pressSequentially("Б".repeat(501));
      await expect(bio).toHaveValue("Б".repeat(500));
      await expect(bio).toHaveAttribute("maxlength", "500");
      await expectNoOverflow(page);

      await username.fill("padded_user");
      await name.fill("");
      await bio.fill("");
      expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(true);

      await username.fill("  padded_user  ");
      await name.fill("Retained display name");
      await bio.fill("First bio line");
      await username.focus();
      await page.keyboard.press("Tab");
      await expect(name).toBeFocused();
      await expect(username).toHaveValue("padded_user");
      await page.keyboard.press("Tab");
      await expect(bio).toBeFocused();
      // Start at a known caret position after keyboard entry on every desktop OS.
      await bio.press("ControlOrMeta+A");
      await bio.pressSequentially("First bio line");
      await bio.press("Enter");
      await bio.pressSequentially("Second bio line");
      await expect(bio).toHaveValue("First bio line\nSecond bio line");
      expect(validation.requests).toEqual([]);
      await page.keyboard.press("Tab");
      await expect(submit).toBeFocused();
      expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(true);

      // Submit from the input, so captureProfileForm also normalizes its live DOM value.
      await username.fill("  padded_user  ");
      await username.press("Enter");
      await expect.poll(() => validation.requests.length).toBe(1);
      await expect(submit).toBeDisabled();
      await expect(submit).toHaveText("Saving profile…");
      for (const field of [username, name, bio]) await expect(field).toBeDisabled();
      await expect(username).toHaveValue("padded_user");
      await page.keyboard.press("Enter");
      await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
      expect(validation.requests).toEqual([
        {
          username: "padded_user",
          display_name: "Retained display name",
          bio: "First bio line\nSecond bio line",
        },
      ]);
      await expectNoOverflow(page);

      validation.release();
      await validation.finished;
      await expect(form.getByRole("alert")).toHaveText(fieldDetails.username.error);
      await expect(username).toBeFocused();
      await expect(submit).toBeEnabled();
      await expect(username).toHaveValue("padded_user");
      await expect(name).toHaveValue("Retained display name");
      await expect(bio).toHaveValue("First bio line\nSecond bio line");
      await expectNoOverflow(page);
      expect(validation.requests).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      validation.release();
      if (validation.requests.length) await validation.finished;
      await page.unroute(endpoint, validation.handle);
    }
  });

  const cases: { name: string; fields: ProfileField[] }[] = [
    { name: "name-only", fields: ["display_name"] },
    { name: "bio-only", fields: ["bio"] },
    // Deliberately reverse the server's key order: focus follows the form's order.
    { name: "multiple", fields: ["bio", "display_name", "username"] },
  ];
  for (const scenario of cases) {
    test(`profile ${scenario.name} field errors retain edits and focus the first field at ${width}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const validation = heldValidation(scenario.fields);
      const endpoint = "**/api/v1/profiles/me/";
      await page.route(endpoint, validation.handle);
      try {
        const form = await openProfile(page, width);
        const values = {
          username: "edited_profile",
          display_name: "Unsaved display name",
          bio: "Unsaved bio\nSecond line",
        };
        const fields = Object.fromEntries(
          Object.entries(fieldDetails).map(([field, details]) => [
            field,
            form.getByLabel(details.label, { exact: true }),
          ]),
        ) as Record<ProfileField, Locator>;
        for (const field of ["username", "display_name", "bio"] as const) {
          await fields[field].fill(values[field]);
        }
        await form.getByRole("button", { name: "Save profile", exact: true }).click();
        await expect.poll(() => validation.requests.length).toBe(1);
        expect(validation.requests[0]).toEqual(values);
        validation.release();
        await validation.finished;

        const first = (["username", "display_name", "bio"] as const).find((field) =>
          scenario.fields.includes(field),
        )!;
        await expect(fields[first]).toBeFocused();
        await expect(form.getByRole("alert")).toHaveCount(scenario.fields.length);
        for (const field of ["username", "display_name", "bio"] as const) {
          const invalid = scenario.fields.includes(field);
          const details = fieldDetails[field];
          await expect(fields[field]).toBeEnabled();
          await expect(fields[field]).toHaveValue(values[field]);
          await expect(fields[field]).toHaveAttribute("aria-invalid", String(invalid));
          await expect(fields[field]).toHaveAccessibleDescription(
            invalid ? `${details.hint} ${details.error}` : details.hint,
          );
          if (invalid) {
            const alert = form.getByRole("alert").filter({ hasText: details.error });
            await expect(alert).toHaveText(details.error);
            expect((await fields[field].getAttribute("aria-describedby"))?.split(" ")).toContain(
              await alert.getAttribute("id"),
            );
          }
        }
        await expectNoOverflow(page);

        await fields[first].fill(
          first === "username" ? `${values[first]}_fixed` : `${values[first]} corrected`,
        );
        await expect(fields[first]).toHaveAttribute("aria-invalid", "false");
        await expect(fields[first]).toHaveAccessibleDescription(fieldDetails[first].hint);
        await expect(form.getByText(fieldDetails[first].error, { exact: true })).toHaveCount(0);
        for (const field of ["username", "display_name", "bio"] as const) {
          if (field === first) continue;
          await expect(fields[field]).toHaveValue(values[field]);
          const invalid = scenario.fields.includes(field);
          await expect(fields[field]).toHaveAttribute("aria-invalid", String(invalid));
          if (invalid) {
            await expect(form.getByText(fieldDetails[field].error, { exact: true })).toBeVisible();
          }
        }
        await expect(form.getByRole("alert")).toHaveCount(scenario.fields.length - 1);
        await expectNoOverflow(page);
        expect(validation.requests).toHaveLength(1);
        expect(errors).toEqual([]);
      } finally {
        validation.release();
        if (validation.requests.length) await validation.finished;
        await page.unroute(endpoint, validation.handle);
      }
    });
  }
}
