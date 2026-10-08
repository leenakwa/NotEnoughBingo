import { expect, test, type Locator } from "@playwright/test";

// Exercise the actual profile tabs with controlled API responses. These cases
// verify rendered interaction states, not server persistence or physical devices.
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "tab_profile",
  display_name: "Tab Profile",
  avatar: null,
  email: "tab-profile@example.test",
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
    throw new Error(`Unexpected profile tab request: ${path}`);
  });
});

function luminance(color: string) {
  const match = color.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  expect(match, `Expected an opaque sRGB color, received ${color}`).not.toBeNull();
  const [red, green, blue] = match!.slice(1).map((channel) => {
    const value = Number(channel) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

async function renderedState(tab: Locator, state: string) {
  const style = await tab.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      color: computed.color,
      background: computed.backgroundColor,
      outlineStyle: computed.outlineStyle,
      outlineWidth: Number.parseFloat(computed.outlineWidth),
      transform: computed.transform,
      hover: element.matches(":hover"),
      active: element.matches(":active"),
      focusVisible: element.matches(":focus-visible"),
    };
  });
  const foreground = luminance(style.color);
  const background = luminance(style.background);
  const contrast =
    (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  expect(contrast, `${state} text contrast`).toBeGreaterThanOrEqual(4.5);
  return { state, ...style, contrast };
}

for (const width of [320, 1710]) {
  test(`selected profile tab stays readable in pointer and keyboard states at ${width}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    const pageViewRecorded = page.waitForResponse("**/api/v1/interactions/");
    await page.goto("/profile");
    await expect(page.getByLabel("Username", { exact: true })).toHaveValue(user.username);
    expect((await pageViewRecorded).status()).toBe(204);
    const tablist = page.getByRole("tablist", { name: "Profile sections", exact: true });
    const selected = tablist.getByRole("tab", { name: "Created", exact: true });
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("No published bingos yet", { exact: true })).toBeVisible();
    await selected.scrollIntoViewIfNeeded();

    await page.mouse.move(0, 0);
    const normal = await renderedState(selected, "normal");
    expect(normal.hover).toBe(false);
    expect(normal.active).toBe(false);

    await selected.hover();
    const hovered = await renderedState(selected, "hover");
    expect(hovered.hover).toBe(true);
    expect(hovered.active).toBe(false);

    let pressed: Awaited<ReturnType<typeof renderedState>>;
    await page.mouse.down();
    try {
      pressed = await renderedState(selected, "held press");
      expect(pressed.hover).toBe(true);
      expect(pressed.active).toBe(true);
      expect(pressed.transform).not.toBe(normal.transform);
    } finally {
      await page.mouse.up();
    }

    await page.mouse.move(0, 0);
    await selected.press("ArrowRight");
    await expect(tablist.getByRole("tab", { name: "Drafts", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(selected).toBeFocused();
    await expect(selected).toHaveAttribute("aria-selected", "true");
    const focused = await renderedState(selected, "keyboard focus");
    expect(focused.focusVisible).toBe(true);
    expect(focused.outlineStyle).not.toBe("none");
    expect(focused.outlineWidth).toBeGreaterThanOrEqual(2);
    await expect(page.getByText("No published bingos yet", { exact: true })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBe(dimensions.viewport);
    expect(errors).toEqual([]);
    await info.attach("profile-tab-state-evidence", {
      body: JSON.stringify(
        { width, states: [normal, hovered, pressed!, focused], dimensions, errors },
        null,
        2,
      ),
      contentType: "application/json",
    });
  });
}
