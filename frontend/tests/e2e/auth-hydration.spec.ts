import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

const emailValue = "hydrated-controls@example.test";
const usernameValue = "hydrated_user";
const passwordValue = "Hydrated-Password!2026";

const scenarios = [
  {
    name: "registration",
    path: "/register",
    heading: "Join Not Enough Bingo",
    endpoint: "/api/v1/auth/register/",
    fields: ["email", "username", "password"],
    submit: "Create account",
  },
  {
    name: "forgot password",
    path: "/forgot-password",
    heading: "Reset your password",
    endpoint: "/api/v1/auth/password-reset/",
    fields: ["email"],
    submit: "Send reset link",
  },
] as const;

async function replaceByKeyboard(input: Locator, value: string) {
  await input.focus();
  await input.press("ControlOrMeta+A");
  await input.press("Backspace");
  await input.pressSequentially(value);
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

async function expectNoOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(width.content).toBe(width.viewport);
}

for (const scenario of scenarios) {
  for (const width of [320, 1710]) {
    test(`${scenario.name} waits for hydration before accepting keyboard input at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const pageErrorNames: string[] = [];
      const defaultGetFields: string[][] = [];
      const unexpectedMutations: { method: string; path: string }[] = [];
      const submissions: unknown[] = [];
      page.on("pageerror", (error) => pageErrorNames.push(error.name));
      page.on("request", (request) => {
        if (request.isNavigationRequest() && request.method() === "GET") {
          const keys = [...new URL(request.url()).searchParams.keys()].filter((key) =>
            ["email", "username", "password"].includes(key),
          );
          if (keys.length) defaultGetFields.push(keys);
        }
      });

      // Every browser API response is controlled; this test does not create accounts
      // or send recovery emails through the real backend.
      await page.route("**/api/v1/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === scenario.endpoint && request.method() === "POST") {
          submissions.push(request.postDataJSON());
          await route.fulfill({
            status: 202,
            json:
              scenario.name === "registration"
                ? { status: "verification_required" }
                : { status: "accepted" },
          });
          return;
        }
        if (path === "/api/v1/auth/session/" && request.method() === "GET") {
          await route.fulfill({ json: { user: null } });
          return;
        }
        if (path === "/api/v1/auth/csrf/" && request.method() === "GET") {
          await route.fulfill({ json: {} });
          return;
        }
        if (path === "/api/v1/interactions/" && request.method() === "POST") {
          await route.fulfill({ status: 204 });
          return;
        }
        if (!["GET", "HEAD"].includes(request.method())) {
          unexpectedMutations.push({ method: request.method(), path });
        }
        await route.fulfill({ status: 503, json: {} });
      });

      let releaseScripts!: () => void;
      const scriptsReleased = new Promise<void>((resolve) => {
        releaseScripts = resolve;
      });
      let heldScripts = 0;
      const continuingScripts = new Set<Promise<void>>();
      const nextScript = (url: URL) =>
        url.pathname.startsWith("/_next/") && url.pathname.endsWith(".js");
      const holdScript = (route: Route) => {
        heldScripts += 1;
        const continuing = scriptsReleased.then(() => route.continue());
        continuingScripts.add(continuing);
        void continuing.then(
          () => continuingScripts.delete(continuing),
          () => continuingScripts.delete(continuing),
        );
        return continuing;
      };
      await page.route(nextScript, holdScript);

      try {
        // Held scripts can prevent DOMContentLoaded. The assertions below require
        // the server-rendered form, rather than a loading or empty fallback.
        await page.goto(scenario.path, { waitUntil: "commit" });
        const heading = page.getByRole("heading", { name: scenario.heading, exact: true });
        const form = page.locator("form.stack-form");
        const submit = form.getByRole("button", { name: scenario.submit, exact: true });
        await expect(heading).toBeVisible();
        await expect(form).toBeVisible();
        await expect.poll(() => heldScripts).toBeGreaterThan(0);
        for (const name of scenario.fields) {
          const input = form.locator(`input[name="${name}"]`);
          await expect(input).toBeVisible();
          await expect(input).toBeDisabled();
          await expect(input).toHaveValue("");
        }
        await expect(submit).toBeDisabled();
        if (scenario.name === "registration") {
          await expect(form.getByRole("button", { name: "Show", exact: true })).toBeDisabled();
        }

        // Native Tab skips the disabled form controls. A native pointer attempt
        // followed by keyboard typing and Enter cannot edit or submit them either.
        await heading.click();
        for (let step = 0; step < scenario.fields.length + 2; step += 1) {
          await page.keyboard.press("Tab");
          expect(await form.evaluate((element) => element.contains(document.activeElement))).toBe(
            false,
          );
        }
        for (const name of scenario.fields) {
          await heading.click();
          await page.evaluate(() => {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          });
          await form.locator(`input[name="${name}"]`).click({ force: true });
          await page.keyboard.type("before_hydration");
          await page.keyboard.press("Enter");
          await expect(form.locator(`input[name="${name}"]`)).toHaveValue("");
        }
        await heading.click();
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        await submit.click({ force: true });
        await page.keyboard.press("Enter");
        expect(submissions).toEqual([]);
        expect(defaultGetFields).toEqual([]);
        expect(unexpectedMutations).toEqual([]);
        await expect(page).toHaveURL(new RegExp(`${scenario.path}$`));

        releaseScripts();
        await page.unroute(nextScript, holdScript);
        await Promise.all(continuingScripts);
        for (const name of scenario.fields) {
          await expect(form.locator(`input[name="${name}"]`)).toBeEnabled();
          await expect(form.locator(`input[name="${name}"]`)).toHaveValue("");
        }
        await expect(submit).toBeEnabled();

        const email = form.getByLabel("Email", { exact: true });
        await submit.click();
        await expectInvalid(email, "valueMissing");
        await email.pressSequentially("invalid-email");
        if (scenario.name === "registration") {
          const username = form.locator('input[name="username"]');
          const password = form.getByLabel("Password", { exact: true });
          await username.pressSequentially(usernameValue);
          await password.pressSequentially("short");
          await submit.click();
          await expectInvalid(email, "typeMismatch");
          expect(submissions).toEqual([]);

          await replaceByKeyboard(email, emailValue);
          await expect(username).toHaveValue(usernameValue);
          await expect(password).toHaveValue("short");
          await submit.click();
          await expectInvalid(password, "tooShort");
          await expect(username).toHaveValue(usernameValue);
          await expect(email).toHaveValue(emailValue);
          expect(submissions).toEqual([]);

          await replaceByKeyboard(password, passwordValue);
          await page.keyboard.press("Tab");
          await expect(form.getByRole("button", { name: "Show", exact: true })).toBeFocused();
          await page.keyboard.press("Space");
          await expect(password).toHaveAttribute("type", "text");
          await expect(password).toHaveValue(passwordValue);
          await page.keyboard.press("Space");
          await expect(password).toHaveAttribute("type", "password");
          await expect(password).toHaveValue(passwordValue);
          await password.focus();
          await page.keyboard.press("Enter");
          await expect(page).toHaveURL(/\/verify-email\?email=hydrated-controls%40example\.test$/);
          await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
          expect(submissions).toEqual([
            { email: emailValue, username: usernameValue, password: passwordValue },
          ]);
        } else {
          await submit.click();
          await expectInvalid(email, "typeMismatch");
          expect(submissions).toEqual([]);
          await replaceByKeyboard(email, emailValue);
          await page.keyboard.press("Enter");
          await expect(form.getByRole("status")).toHaveText(
            "If an account exists for that address, a reset email is on its way.",
          );
          await expect(email).toHaveValue(emailValue);
          await expect(submit).toBeEnabled();
          expect(submissions).toEqual([{ email: emailValue }]);
        }

        await expectNoOverflow(page);
        expect(defaultGetFields).toEqual([]);
        expect(unexpectedMutations).toEqual([]);
        expect(pageErrorNames).toEqual([]);
      } finally {
        // Release every intercepted chunk even if an SSR or keyboard assertion fails.
        releaseScripts();
        await page.unroute(nextScript, holdScript);
        await Promise.all(continuingScripts);
      }
    });
  }
}
