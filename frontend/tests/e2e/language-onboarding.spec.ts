import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "new_player",
  display_name: "New Player",
  avatar: null,
  email: "new-player@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};
const emptyPage = { count: 0, next: null, previous: null, results: [] };

test.beforeEach(async ({ page }) => {
  let signedIn = false;
  let languages: string[] = [];
  let confirmed = false;
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({ json: { user: signedIn ? user : null } }),
  );
  await page.route("**/api/v1/auth/csrf/", (route) => route.fulfill({ json: { csrf: "test" } }));
  await page.route("**/api/v1/auth/me/", (route) => route.fulfill({ json: user }));
  await page.route("**/api/v1/auth/register/", (route) =>
    route.fulfill({ status: 202, json: { status: "verification_required" } }),
  );
  await page.route("**/api/v1/auth/verify-email/", (route) => route.fulfill({ json: user }));
  await page.route("**/api/v1/auth/login/", (route) => {
    signedIn = true;
    return route.fulfill({ json: { user } });
  });
  await page.route("**/api/v1/profiles/me/", (route) => {
    if (route.request().method() === "PATCH") {
      languages = route.request().postDataJSON().preferred_languages;
      confirmed = true;
    }
    return route.fulfill({
      json: {
        ...user,
        bio: "",
        follower_count: 0,
        following_count: 0,
        is_following: false,
        privacy: {
          show_bio: true,
          show_created_bingos: true,
          show_play_history: true,
          show_shared_results: true,
          show_followers: true,
          show_following: true,
        },
        preferred_languages: languages,
        language_preferences_confirmed: confirmed,
      },
    });
  });
  await page.route("**/api/v1/profiles/new_player/bingos/**", (route) =>
    route.fulfill({ json: emptyPage }),
  );
  await page.route("**/api/v1/profiles/notification-preferences/", (route) =>
    route.fulfill({ json: { comments: true, likes: true, follows: true, system: true } }),
  );
  await page.route("**/api/v1/notifications/unread-count/", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/v1/auth/sessions/**", (route) => route.fulfill({ json: emptyPage }));
  await page.route("**/api/v1/feeds/discover/**", (route) => route.fulfill({ json: emptyPage }));
  await page.route("**/api/v1/feeds/trending/**", (route) => route.fulfill({ json: emptyPage }));
  await page.route("**/api/v1/bingos/?*", (route) => route.fulfill({ json: emptyPage }));
  await page.route("**/api/v1/interactions/", (route) => route.fulfill({ status: 204, body: "" }));
});

async function logIn(page: Page) {
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill("long-safe-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/discover$/);
}

async function completeRegistration(page: Page) {
  await page.goto("/verify-email?token=new-account-token");
  await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: "Log in", exact: true }).first().click();
  const login = page.getByRole("dialog", { name: "Log in", exact: true });
  await login.getByLabel("Email").fill(user.email);
  await login.getByLabel("Password").fill("long-safe-password");
  await login.getByRole("button", { name: "Log in", exact: true }).click();
  return page.getByRole("dialog", { name: "Which bingo languages do you prefer?" });
}

test("registration languages are a one-time dialog and saved preferences stay in settings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const dialog = await completeRegistration(page);
  await expect(dialog.getByRole("button", { name: "Save preferences" })).toBeEnabled();
  await dialog.getByLabel("Russian").check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/profiles/me/") && response.request().method() === "PATCH",
  );
  await dialog.getByRole("button", { name: "Save preferences" }).click();
  expect((await saved).request().postDataJSON()).toEqual({ preferred_languages: ["en", "ru"] });
  await expect(dialog).toBeHidden();
  await page.goto("/discover");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/explore");
  await expect(page.getByRole("group", { name: "Bingo languages" })).toHaveCount(0);
  await page.goto("/profile");
  const languages = page.getByRole("group", { name: "Preferred languages" });
  await expect(languages.getByLabel("English")).toBeChecked();
  await expect(languages.getByLabel("Russian")).toBeChecked();
  expect(errors).toEqual([]);
});

test("Maybe later opens a compact reminder, requires confirmation, and permits a save retry", async ({
  page,
}) => {
  let patches = 0;
  await page.route("**/api/v1/profiles/me/", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches += 1;
    expect(route.request().postDataJSON()).toEqual({ preferred_languages: [] });
    if (patches === 1)
      return route.fulfill({
        status: 503,
        json: { error: { code: "unavailable", message: "Try again later." } },
      });
    return route.fallback();
  });
  const dialog = await completeRegistration(page);
  await expect(dialog.getByRole("button", { name: "Maybe later" })).toBeEnabled();
  const before = await dialog.boundingBox();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Maybe later" }).click();
  const reminder = page.getByRole("dialog", { name: "Language settings", exact: true });
  await expect(reminder).toContainText("Profile settings, under Bingo languages");
  await expect(reminder.getByRole("checkbox")).toHaveCount(0);
  const after = await reminder.boundingBox();
  expect(after!.width).toBeLessThanOrEqual(before!.width);
  expect(after!.height).toBeLessThan(before!.height);
  await expect(reminder.getByRole("button", { name: "Got it" })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.mouse.click(1, 1);
  await expect(reminder).toBeVisible();
  expect(patches).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await reminder.getByRole("button", { name: "Got it" }).click();
  await expect(reminder.getByRole("alert")).toHaveText("Try again later.");
  await reminder.getByRole("button", { name: "Got it" }).click();
  await expect(reminder).toBeHidden();
  expect(patches).toBe(2);
  await page.goto("/discover");
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("direct login after email verification keeps onboarding through the route change", async ({
  page,
}) => {
  await page.goto("/verify-email?token=new-account-token");
  await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
  await logIn(page);
  const dialog = page.getByRole("dialog", { name: "Which bingo languages do you prefer?" });
  await expect(dialog.getByRole("button", { name: "Save preferences" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Close account dialog" }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("ordinary login and browsing never ask for languages, even for unconfigured accounts", async ({
  page,
}) => {
  await page.goto("/discover");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.goto("/login");
  await logIn(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.goto("/trending");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/explore");
  await expect(page.getByRole("group", { name: "Bingo languages" })).toHaveCount(0);
});

test("first login from profile updates its language settings after onboarding", async ({
  page,
}) => {
  await page.goto("/verify-email?token=new-account-token");
  await expect(page.getByRole("heading", { name: "Email verified", exact: true })).toBeVisible();
  await page.goto("/profile");
  await page.getByRole("link", { name: "Log in", exact: true }).first().click();
  const login = page.getByRole("dialog", { name: "Log in", exact: true });
  await login.getByLabel("Email").fill(user.email);
  await login.getByLabel("Password").fill("long-safe-password");
  await login.getByRole("button", { name: "Log in", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Which bingo languages do you prefer?" });
  await expect(dialog.getByRole("button", { name: "Save preferences" })).toBeEnabled();
  await dialog.getByLabel("Russian").check();
  await dialog.getByRole("button", { name: "Save preferences" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/profile$/);
  const languages = page.getByRole("group", { name: "Preferred languages" });
  await expect(languages.getByLabel("English")).toBeChecked();
  await expect(languages.getByLabel("Russian")).toBeChecked();
});

test("language selection and reminder fit a narrow, short viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 430 });
  const dialog = await completeRegistration(page);
  await expect(dialog.getByRole("button", { name: "Maybe later" })).toBeEnabled();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.height).toBeLessThanOrEqual(430);
  await dialog.getByLabel("Russian").check();
  await dialog.getByRole("button", { name: "Maybe later" }).click();
  const reminder = page.getByRole("dialog", { name: "Language settings", exact: true });
  await expect(reminder.getByRole("button", { name: "Got it" })).toBeInViewport();
  expect(await reminder.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await reminder.getByRole("button", { name: "Got it" }).click();
  await expect(reminder).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
