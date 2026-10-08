import { expect, test, type Locator, type Page } from "@playwright/test";

const passwordValue = "Native-Password!2026";
const emailValue = "native-controls@example.test";

const scenarios = [
  {
    name: "login",
    path: "/login",
    endpoint: "login/",
    fields: { email: emailValue, password: passwordValue },
    pending: "Logging in…",
    error: "The email or password is incorrect.",
  },
  {
    name: "registration",
    path: "/register",
    endpoint: "register/",
    fields: { email: emailValue, username: "native_user", password: passwordValue },
    pending: "Creating account…",
    error: "This username is already taken.",
    errorField: "username",
  },
  {
    name: "forgot password",
    path: "/forgot-password",
    endpoint: "password-reset/",
    fields: { email: emailValue },
    pending: "Sending…",
    error: "Please check your email address.",
  },
  {
    name: "reset confirmation",
    path: "/reset-password?uid=native-uid&token=native-token",
    endpoint: "password-reset/confirm/",
    fields: { new_password: passwordValue },
    pending: "Updating…",
    error: "This password is too common.",
    errorField: "new_password",
  },
] as const;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/auth/session/", (route) => route.fulfill({ json: { user: null } }));
  await page.route("**/api/v1/auth/csrf/", (route) => route.fulfill({ json: {} }));
});

async function expectInvalid(
  input: Locator,
  validity: "valueMissing" | "typeMismatch" | "tooShort" | "patternMismatch",
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

async function geometry(form: Locator) {
  return form.evaluate((element: HTMLFormElement) => {
    const bounds = element.getBoundingClientRect();
    const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const button = submit.getBoundingClientRect();
    return {
      height: bounds.height,
      button: { y: button.y - bounds.y, height: button.height },
      inputs: [...element.querySelectorAll("input")].map((input) => {
        const box = input.getBoundingClientRect();
        return { x: box.x - bounds.x, y: box.y - bounds.y, width: box.width, height: box.height };
      }),
    };
  });
}

for (const scenario of scenarios) {
  test(`${scenario.name} native validation, Tab, Enter, and pending controls at 320 and 1710`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    for (const width of [320, 1710]) {
      await page.setViewportSize({ width, height: 900 });
      const requests: unknown[] = [];
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const endpoint = `**/api/v1/auth/${scenario.endpoint}`;
      const errorField = "errorField" in scenario ? scenario.errorField : undefined;
      await page.route(endpoint, async (route) => {
        expect(route.request().method()).toBe("POST");
        requests.push(route.request().postDataJSON());
        await held;
        await route.fulfill({
          status: 400,
          json: {
            error: {
              code: "validation_error",
              message: scenario.error,
              ...(errorField
                ? { details: { [errorField]: [{ message: scenario.error, code: "invalid" }] } }
                : {}),
            },
          },
        });
      });

      try {
        const sessionReady = page.waitForResponse("**/api/v1/auth/session/");
        await page.goto(scenario.path);
        expect((await sessionReady).status()).toBe(200);
        const form = page.locator("form.stack-form");
        await expect(form).toBeVisible();
        await expect(page.getByText("Checking your session…", { exact: true })).toHaveCount(0);
        const submit = form.locator('button[type="submit"]');
        const names = Object.keys(scenario.fields);
        const first = form.locator(`input[name="${names[0]}"]`);
        await submit.click();
        await expectInvalid(first, "valueMissing");
        expect(requests).toEqual([]);

        if ("email" in scenario.fields) {
          const email = form.getByLabel("Email", { exact: true });
          await email.fill("invalid-email");
          await submit.click();
          await expectInvalid(email, "typeMismatch");
          expect(requests).toEqual([]);
          await email.fill(emailValue);
        }

        if ("username" in scenario.fields) {
          const username = form.getByLabel("Username");
          await submit.click();
          await expectInvalid(username, "valueMissing");
          await username.pressSequentially("ab");
          await submit.click();
          await expectInvalid(username, "tooShort");
          await username.fill("bad-name");
          await submit.click();
          await expectInvalid(username, "patternMismatch");
          await username.fill("");
          await username.pressSequentially("a".repeat(31));
          await expect(username).toHaveValue("a".repeat(30));
          await expect(username).toHaveAttribute("minlength", "3");
          await expect(username).toHaveAttribute("maxlength", "30");
          await expect(form.getByLabel("Email", { exact: true })).toHaveAttribute(
            "maxlength",
            "254",
          );
          expect(requests).toEqual([]);
          await username.fill(scenario.fields.username);
        }

        const passwordName = names.find((name) => name === "password" || name === "new_password");
        const password = passwordName ? form.locator(`input[name="${passwordName}"]`) : undefined;
        if (password) {
          await submit.click();
          await expectInvalid(password, "valueMissing");
          if (scenario.name !== "login") {
            await password.pressSequentially("short");
            await submit.click();
            await expectInvalid(password, "tooShort");
            await expect(password).toHaveAttribute("minlength", "12");
            await expect(form.getByText(/Use at least 12 characters\./)).toBeVisible();
          }
          expect(requests).toEqual([]);
          await password.fill(passwordValue);
        }

        // Begin at the first input; every subsequent form control is reached by Tab.
        await first.focus();
        for (const name of names.slice(1)) {
          await page.keyboard.press("Tab");
          await expect(form.locator(`input[name="${name}"]`)).toBeFocused();
        }
        if (password) {
          await page.keyboard.press("Tab");
          await expect(form.getByRole("button", { name: "Show", exact: true })).toBeFocused();
          await page.keyboard.press("Space");
          await expect(password).toHaveAttribute("type", "text");
          await expect(password).toHaveValue(passwordValue);
          await expect(form.getByRole("button", { name: "Hide", exact: true })).toBeFocused();
          await page.keyboard.press("Space");
          await expect(password).toHaveAttribute("type", "password");
          await expect(password).toHaveValue(passwordValue);
        }
        if (scenario.name === "login") {
          // macOS WebKit uses Option-Tab to include links in keyboard navigation.
          await page.keyboard.press(
            browserName === "webkit" && process.platform === "darwin" ? "Alt+Tab" : "Tab",
          );
          await expect(form.getByRole("link", { name: "Forgot password?" })).toBeFocused();
        }
        await page.keyboard.press("Tab");
        await expect(submit).toBeFocused();
        expect(requests).toEqual([]);
        expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(
          true,
        );
        await expectNoOverflow(page);

        const last = form.locator(`input[name="${names.at(-1)}"]`);
        await last.focus();
        const before = await geometry(form);
        await page.keyboard.press("Enter");
        await expect.poll(() => requests.length).toBe(1);
        await expect(submit).toBeDisabled();
        await expect(submit).toHaveText(scenario.pending);
        const pending = await geometry(form);
        expect(pending).toEqual(before);
        await expectNoOverflow(page);
        await page.keyboard.press("Enter");
        await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
        expect(requests).toHaveLength(1);
        expect(requests[0]).toEqual({
          ...scenario.fields,
          ...(scenario.name === "reset confirmation"
            ? { uid: "native-uid", token: "native-token" }
            : {}),
        });

        release();
        const alert = form.getByRole("alert");
        await expect(alert).toHaveText(scenario.error);
        await expect(submit).toBeEnabled();
        for (const [name, value] of Object.entries(scenario.fields)) {
          await expect(form.locator(`input[name="${name}"]`)).toHaveValue(value);
        }
        if (errorField) {
          const rejected = form.locator(`input[name="${errorField}"]`);
          await expect(rejected).toBeFocused();
          await expect(rejected).toHaveAttribute("aria-invalid", "true");
          expect((await rejected.getAttribute("aria-describedby"))?.split(" ")).toContain(
            await alert.getAttribute("id"),
          );
        }
        await expectNoOverflow(page);
        expect(requests).toHaveLength(1);
      } finally {
        release();
        await page.unroute(endpoint);
      }
    }
    expect(errors).toEqual([]);
  });
}
