import { expect, test, type Dialog, type Locator, type Page } from "@playwright/test";

import type {
  AuthenticatedUser,
  NotificationPreferences,
  OwnUserProfile,
  UserPrivacySettings,
} from "@/lib/api/types";

// Real profile controls, keyboard input, and native navigation dialogs with
// explicitly injected API responses. These cases do not prove server persistence.
const user: AuthenticatedUser = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "native_preferences",
  display_name: "Native Preferences",
  avatar: null,
  email: "native-preferences@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};
const initialPrivacy: UserPrivacySettings = {
  show_bio: true,
  show_created_bingos: true,
  show_play_history: true,
  show_shared_results: true,
  show_followers: true,
  show_following: true,
};
const initialNotifications: NotificationPreferences = {
  new_comment: true,
  comment_reply: true,
  bingo_like: true,
  comment_like: true,
  new_follower: true,
  marketing_email: false,
};
const languageNames = [
  "English",
  "Russian",
  "Ukrainian",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Polish",
  "Turkish",
  "Arabic",
  "Hindi",
  "Japanese",
  "Korean",
  "Chinese",
] as const;
const privacyControls: ReadonlyArray<readonly [keyof UserPrivacySettings, string]> = [
  ["show_bio", "Show bio"],
  ["show_created_bingos", "Show created bingos"],
  ["show_play_history", "Show play history"],
  ["show_shared_results", "Show shared results"],
  ["show_followers", "Show followers"],
  ["show_following", "Show following"],
];
const notificationControls: ReadonlyArray<readonly [keyof NotificationPreferences, string]> = [
  ["new_comment", "New comments on my bingos"],
  ["comment_reply", "Replies to my comments"],
  ["bingo_like", "Likes on my bingos"],
  ["comment_like", "Likes on my comments"],
  ["new_follower", "New followers"],
  ["marketing_email", "Optional product email"],
];
const emptyPage = { count: 0, next: null, previous: null, results: [] };
type Write = { method: string; path: string; body: Record<string, unknown> };

async function controlledPreferences(page: Page) {
  const writes: Write[] = [];
  const errors: string[] = [];
  let profile: OwnUserProfile = {
    ...user,
    bio: "",
    follower_count: 0,
    following_count: 0,
    is_following: false,
    preferred_languages: ["en"],
    language_preferences_confirmed: true,
    privacy: { ...initialPrivacy },
  };
  let notifications = { ...initialNotifications };
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/v1/interactions/") {
      expect(method).toBe("POST");
      return route.fulfill({ status: 204, body: "" });
    }
    if (method !== "GET") {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push({ method, path, body });
      if (path === "/api/v1/profiles/me/" && method === "PATCH") {
        expect(Object.keys(body)).toEqual(["preferred_languages"]);
        expect(Array.isArray(body.preferred_languages)).toBe(true);
        profile = { ...profile, preferred_languages: body.preferred_languages as string[] };
        return route.fulfill({ json: profile });
      }
      if (path === "/api/v1/profiles/me/privacy/" && method === "PUT") {
        expect(Object.keys(body).sort()).toEqual(Object.keys(initialPrivacy).sort());
        profile = { ...profile, privacy: body as unknown as UserPrivacySettings };
        return route.fulfill({ json: profile.privacy });
      }
      if (path === "/api/v1/profiles/notification-preferences/" && method === "PATCH") {
        expect(Object.keys(body)).toHaveLength(1);
        expect(Object.keys(initialNotifications)).toContain(Object.keys(body)[0]);
        notifications = { ...notifications, ...body };
        return route.fulfill({ json: notifications });
      }
      throw new Error(`Unexpected preference mutation: ${method} ${path}`);
    }
    // Discover may server-render real card artwork. Image transport is outside
    // these controlled preference cases; every media mutation remains strict.
    if (path.startsWith("/api/v1/media/")) return route.abort();
    if (path === "/api/v1/auth/session/") return route.fulfill({ json: { user } });
    if (path === "/api/v1/auth/me/") return route.fulfill({ json: user });
    if (path === "/api/v1/auth/csrf/") return route.fulfill({ json: { csrf: "test" } });
    if (path === "/api/v1/profiles/me/") return route.fulfill({ json: profile });
    if (path === "/api/v1/profiles/notification-preferences/") {
      return route.fulfill({ json: notifications });
    }
    if (path === "/api/v1/notifications/unread-count/") {
      return route.fulfill({ json: { count: 0 } });
    }
    if (
      path.startsWith("/api/v1/profiles/") ||
      path === "/api/v1/auth/sessions/" ||
      path === "/api/v1/feeds/discover/"
    ) {
      return route.fulfill({ json: emptyPage });
    }
    throw new Error(`Unexpected preference request: ${method} ${path}`);
  });
  return { writes, errors };
}

function settingsCard(page: Page, heading: string) {
  return page.locator(".settings-card").filter({
    has: page.getByRole("heading", { name: heading, exact: true }),
  });
}

function languages(page: Page) {
  return page.getByRole("group", { name: "Preferred languages", exact: true });
}

function language(page: Page, name: string) {
  return languages(page).getByRole("checkbox", { name, exact: true });
}

async function openPreferences(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const recorded = page.waitForResponse("**/api/v1/interactions/");
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Save profile", exact: true })).toBeEnabled();
  await expect(languages(page).getByRole("checkbox")).toHaveCount(15);
  await expect(language(page, "English")).toBeChecked();
  await expect(language(page, "Russian")).not.toBeChecked();
  await expect(settingsCard(page, "Privacy").getByRole("checkbox")).toHaveCount(6);
  await expect(settingsCard(page, "Notification preferences").getByRole("checkbox")).toHaveCount(6);
  expect((await recorded).status()).toBe(204);
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

async function expectNoFormOwner(control: Locator) {
  expect(await control.evaluate((element: HTMLInputElement) => element.form === null)).toBe(true);
}

async function expectNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBe(dimensions.viewport);
}

async function saveLanguages(page: Page, writes: Write[], key: "Enter" | "Space") {
  const recorded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/profiles/me/" &&
      response.request().method() === "PATCH",
  );
  const previous = writes.length;
  await page.getByRole("button", { name: "Save languages", exact: true }).press(key);
  expect((await recorded).status()).toBe(200);
  await expect(settingsCard(page, "Bingo languages").getByRole("status")).toHaveText(
    "Bingo languages saved.",
  );
  await expect(language(page, "English")).toBeEnabled();
  expect(writes).toHaveLength(previous + 1);
}

for (const width of [320, 1710]) {
  test(`preference languages native Tab, ShiftTab, Enter, and Space at ${width}`, async ({
    page,
  }) => {
    const { writes, errors } = await controlledPreferences(page);
    await openPreferences(page, width);
    const saveProfile = page.getByRole("button", { name: "Save profile", exact: true });
    const saveLanguagesButton = page.getByRole("button", { name: "Save languages", exact: true });
    const firstPrivacy = settingsCard(page, "Privacy").getByRole("checkbox").first();
    await saveProfile.focus();
    for (const name of languageNames) {
      await page.keyboard.press("Tab");
      const control = language(page, name);
      await expectKeyboardFocus(control);
      await expectNoFormOwner(control);
    }
    await page.keyboard.press("Tab");
    await expectKeyboardFocus(saveLanguagesButton);
    await page.keyboard.press("Tab");
    await expectKeyboardFocus(firstPrivacy);
    await page.keyboard.press("Shift+Tab");
    await expectKeyboardFocus(saveLanguagesButton);
    for (const name of [...languageNames].reverse()) {
      await page.keyboard.press("Shift+Tab");
      await expectKeyboardFocus(language(page, name));
    }
    await page.keyboard.press("Shift+Tab");
    await expectKeyboardFocus(saveProfile);

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(language(page, "English")).toBeChecked();
    expect(writes).toEqual([]);
    await page.keyboard.press("Tab");
    await expectKeyboardFocus(language(page, "Russian"));
    await page.keyboard.press("Space");
    await expect(language(page, "Russian")).toBeChecked();
    expect(writes).toEqual([]);
    for (let index = 2; index < languageNames.length; index += 1) {
      await page.keyboard.press("Tab");
      await expectKeyboardFocus(language(page, languageNames[index]!));
    }
    await page.keyboard.press("Tab");
    await expectKeyboardFocus(saveLanguagesButton);
    await saveLanguages(page, writes, "Enter");
    expect(writes).toEqual([
      {
        method: "PATCH",
        path: "/api/v1/profiles/me/",
        body: { preferred_languages: ["en", "ru"] },
      },
    ]);

    await language(page, "English").press("Space");
    await language(page, "Russian").press("Space");
    await expect(languages(page).getByRole("checkbox", { checked: true })).toHaveCount(0);
    expect(writes).toHaveLength(1);
    // Profile preferences intentionally allow [] to mean all languages. The
    // separate registration onboarding requires at least one selection.
    await saveLanguages(page, writes, "Space");
    expect(writes[1]).toEqual({
      method: "PATCH",
      path: "/api/v1/profiles/me/",
      body: { preferred_languages: [] },
    });
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });

  test(`preference privacy native Tab, ShiftTab, and immediate Space saves at ${width}`, async ({
    page,
  }) => {
    const { writes, errors } = await controlledPreferences(page);
    await openPreferences(page, width);
    await language(page, "Russian").press("Space");
    const card = settingsCard(page, "Privacy");
    const saveLanguagesButton = page.getByRole("button", { name: "Save languages", exact: true });
    const expected = { ...initialPrivacy };
    await saveLanguagesButton.focus();
    for (const [key, label] of privacyControls) {
      await page.keyboard.press("Tab");
      const control = card.getByRole("checkbox", { name: label, exact: true });
      await expectKeyboardFocus(control);
      await expectNoFormOwner(control);
      const previous = writes.length;
      await page.keyboard.press("Enter");
      await expect(control).toBeChecked();
      expect(writes).toHaveLength(previous);
      const recorded = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/v1/profiles/me/privacy/" &&
          response.request().method() === "PUT",
      );
      await page.keyboard.press("Space");
      expect((await recorded).status()).toBe(200);
      expected[key] = false;
      await expect(control).toBeEnabled();
      await expect(control).not.toBeChecked();
      expect(writes).toHaveLength(previous + 1);
      expect(writes.at(-1)).toEqual({
        method: "PUT",
        path: "/api/v1/profiles/me/privacy/",
        body: { ...expected },
      });
      await expect(card.getByRole("status")).toHaveText("Privacy settings saved.");
      await expect(language(page, "Russian")).toBeChecked();
    }
    for (const [, label] of [...privacyControls].reverse().slice(1)) {
      await page.keyboard.press("Shift+Tab");
      await expectKeyboardFocus(card.getByRole("checkbox", { name: label, exact: true }));
    }
    await page.keyboard.press("Shift+Tab");
    await expectKeyboardFocus(saveLanguagesButton);
    expect(writes).toHaveLength(6);
    await expect(language(page, "English")).toBeChecked();
    await expect(language(page, "Russian")).toBeChecked();
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });

  test(`preference notifications native Tab, ShiftTab, and immediate Space saves at ${width}`, async ({
    page,
    browserName,
  }) => {
    const { writes, errors } = await controlledPreferences(page);
    await openPreferences(page, width);
    await language(page, "Russian").press("Space");
    const card = settingsCard(page, "Notification preferences");
    const previousLink = page.getByRole("link", {
      name: "Forgot your current password?",
      exact: true,
    });
    const nextButton = page.getByRole("button", { name: "Request data export", exact: true });
    await previousLink.focus();
    for (const [key, label] of notificationControls) {
      await page.keyboard.press("Tab");
      const control = card.getByRole("checkbox", { name: label, exact: true });
      await expectKeyboardFocus(control);
      await expectNoFormOwner(control);
      const previous = writes.length;
      const original = initialNotifications[key];
      await page.keyboard.press("Enter");
      await expect(control).toBeChecked({ checked: original });
      expect(writes).toHaveLength(previous);
      const recorded = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/v1/profiles/notification-preferences/" &&
          response.request().method() === "PATCH",
      );
      await page.keyboard.press("Space");
      expect((await recorded).status()).toBe(200);
      await expect(control).toBeEnabled();
      await expect(control).toBeChecked({ checked: !original });
      expect(writes).toHaveLength(previous + 1);
      expect(writes.at(-1)).toEqual({
        method: "PATCH",
        path: "/api/v1/profiles/notification-preferences/",
        body: { [key]: !original },
      });
      await expect(card.getByRole("status")).toHaveText("Notification preferences saved.");
      await expect(language(page, "Russian")).toBeChecked();
    }
    await page.keyboard.press("Tab");
    await expectKeyboardFocus(nextButton);
    for (const [, label] of [...notificationControls].reverse()) {
      await page.keyboard.press("Shift+Tab");
      await expectKeyboardFocus(card.getByRole("checkbox", { name: label, exact: true }));
    }
    // macOS WebKit uses Option-Tab to include links in keyboard traversal.
    await page.keyboard.press(
      process.platform === "darwin" && browserName === "webkit" ? "Shift+Alt+Tab" : "Shift+Tab",
    );
    await expectKeyboardFocus(previousLink);
    expect(writes).toHaveLength(6);
    await expect(language(page, "English")).toBeChecked();
    await expect(language(page, "Russian")).toBeChecked();
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
  });

  test(`preference unsaved languages use native navigation and reload dialogs at ${width}`, async ({
    page,
    browser,
  }) => {
    const { writes, errors } = await controlledPreferences(page);
    await openPreferences(page, width);
    const dialogs: { type: string; message: string }[] = [];
    let accept = false;
    let dialogHandled = Promise.resolve();
    const handleDialog = (dialog: Dialog) => {
      dialogs.push({ type: dialog.type(), message: dialog.message() });
      dialogHandled = accept ? dialog.accept() : dialog.dismiss();
      return dialogHandled;
    };
    page.on("dialog", handleDialog);
    try {
      await language(page, "Russian").press("Space");
      const discover = page.getByRole("link", { name: "Discover", exact: true });
      await discover.focus();
      await expectKeyboardFocus(discover);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/profile$/);
      await expect(language(page, "English")).toBeChecked();
      await expect(language(page, "Russian")).toBeChecked();
      expect(dialogs).toEqual([
        { type: "confirm", message: "Your profile changes have not been saved. Leave anyway?" },
      ]);
      expect(writes).toEqual([]);

      accept = true;
      await discover.press("Enter");
      await expect(page).toHaveURL(/\/discover$/);
      await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
      expect(dialogs).toHaveLength(2);
      expect(dialogs[1]).toEqual(dialogs[0]);
      await page.goBack();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(language(page, "Russian")).toBeChecked();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Your unsaved profile changes have been restored." }),
      ).toBeVisible();
      expect(writes).toEqual([]);

      accept = false;
      // Initiate a real reload, then wait for the dialog rather than a new
      // document: dismissing beforeunload intentionally prevents navigation.
      await Promise.all([
        page.waitForEvent("dialog", { predicate: (dialog) => dialog.type() === "beforeunload" }),
        page.evaluate(() => window.location.reload()),
      ]);
      await dialogHandled;
      expect(dialogs).toHaveLength(3);
      expect(dialogs[2]?.type).toBe("beforeunload");
      await expect(language(page, "English")).toBeChecked();
      await expect(language(page, "Russian")).toBeChecked();

      accept = true;
      await page.reload({ waitUntil: "domcontentloaded" });
      const repeatedReloadDialogs = dialogs.slice(3);
      expect(repeatedReloadDialogs.length).toBeLessThanOrEqual(1);
      for (const dialog of repeatedReloadDialogs) expect(dialog.type).toBe("beforeunload");
      test.info().annotations.push({
        type: "native-beforeunload-repeat",
        description: repeatedReloadDialogs.length
          ? "Immediate reload after cancellation showed and accepted a second native prompt."
          : "Immediate reload after cancellation showed no second native prompt; acceptance is checked in a fresh browser context.",
      });
      await expect(language(page, "English")).toBeChecked();
      // The in-memory edit cache survives client navigation, not a full reload.
      await expect(language(page, "Russian")).not.toBeChecked();
      expect(writes).toEqual([]);

      // Some browsers suppress a repeated prompt in the same browsing context.
      // Use an independent context with the same project device and viewport to
      // establish acceptance after a genuine keyboard edit.
      const projectUse = test.info().project.use;
      const originalEnvironment = await page.evaluate(() => ({
        userAgent: navigator.userAgent,
        touchPoints: navigator.maxTouchPoints,
        deviceScaleFactor: window.devicePixelRatio,
        width: innerWidth,
        height: innerHeight,
      }));
      const freshContext = await browser.newContext({
        baseURL: new URL(page.url()).origin,
        viewport: page.viewportSize(),
        userAgent: projectUse.userAgent,
        deviceScaleFactor: projectUse.deviceScaleFactor,
        isMobile: projectUse.isMobile,
        hasTouch: projectUse.hasTouch,
      });
      try {
        const freshPage = await freshContext.newPage();
        const freshFixture = await controlledPreferences(freshPage);
        const acceptedDialogTypes: string[] = [];
        let acceptedDialogHandled = Promise.resolve();
        freshPage.on("dialog", (dialog) => {
          acceptedDialogTypes.push(dialog.type());
          acceptedDialogHandled = dialog.accept();
          return acceptedDialogHandled;
        });
        await openPreferences(freshPage, width);
        expect(
          await freshPage.evaluate(() => ({
            userAgent: navigator.userAgent,
            touchPoints: navigator.maxTouchPoints,
            deviceScaleFactor: window.devicePixelRatio,
            width: innerWidth,
            height: innerHeight,
          })),
        ).toEqual(originalEnvironment);
        await language(freshPage, "Russian").press("Space");
        await expect(language(freshPage, "Russian")).toBeChecked();
        const reloadedView = freshPage.waitForResponse("**/api/v1/interactions/");
        await Promise.all([
          freshPage.waitForNavigation({ waitUntil: "domcontentloaded" }),
          freshPage.evaluate(() => window.location.reload()),
        ]);
        await acceptedDialogHandled;
        expect(acceptedDialogTypes).toEqual(["beforeunload"]);
        await expect(language(freshPage, "English")).toBeChecked();
        await expect(language(freshPage, "Russian")).not.toBeChecked();
        expect((await reloadedView).status()).toBe(204);
        expect(freshFixture.writes).toEqual([]);
        expect(freshFixture.errors).toEqual([]);
        await expectNoOverflow(freshPage);
        test.info().annotations.push({
          type: "native-beforeunload-accept",
          description:
            "Accepted a real prompt in an independent context preserving the project device and viewport.",
        });
      } finally {
        await freshContext.close();
      }

      const completedDialogCount = dialogs.length;
      await language(page, "Russian").press("Space");
      await expect(language(page, "Russian")).toBeChecked();
      await language(page, "Russian").press("Space");
      await expect(language(page, "Russian")).not.toBeChecked();
      await discover.press("Enter");
      await expect(page).toHaveURL(/\/discover$/);
      expect(dialogs).toHaveLength(completedDialogCount);
      await page.goBack();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(language(page, "English")).toBeChecked();
      await expect(language(page, "Russian")).not.toBeChecked();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: "Your unsaved profile changes have been restored." }),
      ).toHaveCount(0);
      expect(writes).toEqual([]);
      await expectNoOverflow(page);
      expect(errors).toEqual([]);
    } finally {
      page.off("dialog", handleDialog);
    }
  });
}
