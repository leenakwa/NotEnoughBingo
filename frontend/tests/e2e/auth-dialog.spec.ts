import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "player",
  display_name: "Player",
  avatar: null,
  email: "player@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/session/", (route) => route.fulfill({ json: { user: null } }));
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ json: { csrf_token: "test" } }),
  );
  await page.route("**/api/v1/interactions/", (route) => route.fulfill({ status: 204, body: "" }));
});

test("account forms open over the current page, trap focus, and restore it on close", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sessionCheck = page.waitForResponse("**/api/v1/auth/session/");
  await page.goto("/support?from=board#contact");
  await sessionCheck;
  const trigger = page.getByRole("link", { name: "Log in", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Log in", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("box-shadow", "rgba(0, 0, 0, 0.28) 0px 3px 10px 0px");
  await expect(page).toHaveURL(/\/support\?from=board#contact$/);
  await expect(page.getByRole("heading", { name: "Support & Moderation" })).toBeVisible();
  await expect(page.locator("main#main-content")).toHaveCount(1);
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

  await dialog.getByRole("button", { name: "Close account dialog" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "Create an account" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close account dialog" })).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  expect(errors).toEqual([]);
});

test("switching forms, recovering a password, and closing by backdrop keep the page", async ({
  page,
}) => {
  await page.goto("/create");
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("Join Not Enough Bingo");
  await dialog.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(dialog).toHaveAccessibleName("Log in");
  await dialog.getByRole("link", { name: "Forgot password?" }).click();
  await expect(dialog).toHaveAccessibleName("Reset your password");
  await page.route("**/api/v1/auth/password-reset/", (route) => route.fulfill({ json: {} }));
  await dialog.getByRole("link", { name: "Back to log in" }).click();
  await expect(dialog).toHaveAccessibleName("Log in");
  await expect(page).toHaveURL(/\/create$/);
  await page.mouse.click(1, 1);
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Create your own bingo" })).toBeVisible();
});

test("registration and verification resend stay in the dialog", async ({ page }) => {
  await page.route("**/api/v1/auth/register/", (route) =>
    route.fulfill({ status: 202, json: { status: "verification_required" } }),
  );
  await page.route("**/api/v1/auth/resend-verification/", (route) => route.fulfill({ json: {} }));
  await page.goto("/create");
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("new-player@example.test");
  await dialog.getByLabel("Username").fill("new_player");
  await dialog.getByLabel("Password").fill("long-safe-password");
  await dialog.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(dialog).toHaveAccessibleName("Check your inbox");
  await expect(dialog).toContainText("new-player@example.test");
  await expect(page).toHaveURL(/\/create$/);
  await dialog.getByRole("button", { name: "Resend verification email" }).click();
  await expect(dialog.getByRole("status")).toContainText("check your inbox");
  await dialog.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(dialog).toHaveAccessibleName("Log in");
});

test("login refreshes the editor in place and errors allow retry", async ({ page }) => {
  let signedIn = false;
  let attempts = 0;
  await page.unroute("**/api/v1/auth/session/");
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({ json: { user: signedIn ? user : null } }),
  );
  await page.route("**/api/v1/notifications/unread-count/", (route) =>
    route.fulfill({ json: { count: 0 } }),
  );
  await page.route("**/api/v1/auth/login/", (route) => {
    attempts += 1;
    if (attempts === 1)
      return route.fulfill({
        status: 400,
        json: { error: { code: "invalid_credentials", message: "Invalid email or password." } },
      });
    signedIn = true;
    return route.fulfill({ json: { user } });
  });
  await page.goto("/create?from=modal");
  await page.getByRole("link", { name: "Log in", exact: true }).last().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(user.email);
  await dialog.getByLabel("Password").fill("long-safe-password");
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Invalid email or password.");
  await expect(dialog.getByLabel("Email")).toHaveValue(user.email);
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/create\?from=modal$/);
  await expect(page.getByRole("heading", { name: "Create bingo", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Profile for Player" })).toBeVisible();
});

test("pending requests keep the dialog open and prevent duplicate submission", async ({ page }) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let submissions = 0;
  await page.route("**/api/v1/auth/login/", async (route) => {
    submissions += 1;
    await pending;
    await route.fulfill({
      status: 503,
      json: { error: { code: "unavailable", message: "Try again later." } },
    });
  });
  await page.goto("/support");
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill(user.email);
  await dialog.getByLabel("Password").fill("long-safe-password");
  await dialog.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Close account dialog" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.mouse.click(1, 1);
  await dialog.getByRole("link", { name: "Create an account" }).click();
  await expect(dialog).toHaveAccessibleName("Log in");
  await dialog.getByLabel("Password").press("Enter");
  expect(submissions).toBe(1);
  finish();
  await expect(dialog.getByRole("alert")).toHaveText("Try again later.");
  await dialog.getByRole("button", { name: "Close account dialog" }).click();
  await expect(dialog).toBeHidden();
});

test("registration fits a narrow, short viewport and scrolls to all controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 430 });
  await page.goto("/create");
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.height).toBeLessThanOrEqual(430);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog
    .getByRole("button", { name: "Create account", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Create account", exact: true }),
  ).toBeInViewport();
  await dialog.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(dialog).toHaveAccessibleName("Log in");
  await dialog.getByRole("button", { name: "Close account dialog" }).click();
  await expect(dialog).toBeHidden();
});
