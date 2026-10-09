import { expect, test, type Locator } from "@playwright/test";

// Actual editor controls with controlled API replies: this checks interaction
// and layout, not server persistence or a physical touch device.
const bingoId = "11111111-1111-4111-8111-111111111111";
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "tag_author",
  display_name: "Tag Author",
  avatar: null,
  email: "tag-author@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};
const longTag = "Я".repeat(40);
const literalTag = "<b>literal & text</b>";
const siblingTag = "keep me";

async function keyboardFocus(button: Locator) {
  await expect(button).toBeFocused();
  const style = await button.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      outlineStyle: computed.outlineStyle,
      outlineWidth: Number.parseFloat(computed.outlineWidth),
    };
  });
  expect(style.focusVisible).toBe(true);
  expect(style.outlineStyle).not.toBe("none");
  expect(style.outlineWidth).toBeGreaterThanOrEqual(2);
  return style;
}

for (const width of [320, 1710]) {
  test(`tag removal has usable targets and preserves sibling tags at ${width}`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    const mutations: { path: string; method: string; tags?: string[] }[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    const draft = {
      id: "33333333-3333-4333-8333-333333333333",
      bingo_id: bingoId,
      title: "Tag target fixture",
      description: "",
      language: "en",
      size: 3,
      visibility: "private",
      completion_style: "checkmark",
      board_background: null,
      cover: null,
      tags: [longTag, literalTag, siblingTag].map((name, index) => ({
        id: String(index),
        name,
        slug: `tag-${index}`,
      })),
      cells: [],
      updated_at: "2026-10-08T00:00:00Z",
      version: 1,
    };
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === "/api/v1/interactions/") {
        expect(method).toBe("POST");
        return route.fulfill({ status: 204, body: "" });
      }
      if (path === `/api/v1/bingos/${bingoId}/draft/` && method === "PUT") {
        const payload = route.request().postDataJSON() as { tags: string[] };
        mutations.push({ path, method, tags: payload.tags });
        draft.tags = payload.tags.map((name, index) => ({
          id: String(index),
          name,
          slug: `tag-${index}`,
        }));
        draft.version += 1;
        return route.fulfill({ json: draft });
      }
      if (method !== "GET") mutations.push({ path, method });
      expect(method, `Unexpected editor mutation of ${path}`).toBe("GET");
      if (path === "/api/v1/auth/session/") return route.fulfill({ json: { user } });
      if (path === "/api/v1/auth/me/") return route.fulfill({ json: user });
      if (path === "/api/v1/auth/csrf/") {
        return route.fulfill({ json: { csrf_token: "test" } });
      }
      if (path === "/api/v1/profiles/me/") {
        return route.fulfill({
          json: { ...user, preferred_languages: ["en"], language_preferences_confirmed: true },
        });
      }
      if (path === "/api/v1/notifications/unread-count/") {
        return route.fulfill({ json: { unread_count: 0 } });
      }
      if (path === `/api/v1/bingos/${bingoId}/draft/`) {
        return route.fulfill({ json: draft });
      }
      if (path === `/api/v1/bingos/${bingoId}/`) {
        return route.fulfill({ json: { id: bingoId, current_revision: null } });
      }
      throw new Error(`Unexpected editor tag request: ${path}`);
    });

    const pageViewRecorded = page.waitForResponse("**/api/v1/interactions/");
    await page.goto(`/create?bingo=${bingoId}`);
    await page.getByRole("button", { name: "Finish creating" }).click();
    await expect(page.getByRole("heading", { name: "Almost there", exact: true })).toBeVisible();
    expect((await pageViewRecorded).status()).toBe(204);
    const tags = page.getByRole("group", { name: "Selected tags", exact: true });
    await expect(tags.getByRole("button")).toHaveCount(3);
    await expect(tags).toContainText(literalTag);
    await expect(tags.locator("b")).toHaveCount(0);
    await tags.scrollIntoViewIfNeeded();
    const layout = await tags.evaluate((group) => {
      const chips = Array.from(group.children).map((chip) => {
        const button = chip.querySelector("button")!;
        const buttonBox = button.getBoundingClientRect();
        const chipBox = chip.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(chip.firstChild!);
        return {
          text: chip.firstChild!.textContent,
          width: buttonBox.width,
          height: buttonBox.height,
          textLines: range.getClientRects().length,
          contentWidth: chip.scrollWidth,
          clientWidth: chip.clientWidth,
          buttonInsideChip: buttonBox.right <= chipBox.right,
        };
      });
      return {
        viewportWidth: document.documentElement.clientWidth,
        pageWidth: document.documentElement.scrollWidth,
        chips,
      };
    });
    expect(layout.pageWidth).toBe(layout.viewportWidth);
    for (const chip of layout.chips) {
      expect(chip.width).toBeGreaterThanOrEqual(44);
      expect(chip.height).toBeGreaterThanOrEqual(44);
      expect(chip.contentWidth).toBeLessThanOrEqual(chip.clientWidth);
      expect(chip.buttonInsideChip).toBe(true);
    }
    if (width === 320) expect(layout.chips[0]!.textLines).toBeGreaterThan(1);

    await page.evaluate(() => {
      document.documentElement.dataset.tagControlSubmits = "0";
      document.addEventListener("submit", () => {
        const root = document.documentElement;
        root.dataset.tagControlSubmits = String(Number(root.dataset.tagControlSubmits) + 1);
      });
    });
    const tagInput = page.getByRole("textbox", { name: "Tag", exact: true });
    const removeLong = tags.getByRole("button", { name: `Remove ${longTag}`, exact: true });
    await expect(removeLong).toHaveAttribute("type", "button");
    await tagInput.click();
    await page.keyboard.press("Tab");
    const firstFocus = await keyboardFocus(removeLong);
    await page.keyboard.press("Space");
    await expect(removeLong).toHaveCount(0);
    await expect(tags.getByRole("button")).toHaveCount(2);
    await expect(tags).toContainText(literalTag);
    await expect(tags).toContainText(siblingTag);

    const removeLiteral = tags.getByRole("button", { name: `Remove ${literalTag}`, exact: true });
    await tagInput.click();
    await page.keyboard.press("Tab");
    const secondFocus = await keyboardFocus(removeLiteral);
    await page.keyboard.press("Enter");
    await expect(removeLiteral).toHaveCount(0);
    await expect(tags.getByRole("button")).toHaveCount(1);
    await expect(
      tags.getByRole("button", { name: `Remove ${siblingTag}`, exact: true }),
    ).toBeVisible();
    // Ordinary autosave is allowed; tag removal must not publish or submit a form.
    await expect.poll(() => mutations.at(-1)?.tags).toEqual([siblingTag]);
    expect(
      mutations.every(({ path, method }) => path.endsWith("/draft/") && method === "PUT"),
    ).toBe(true);
    await expect(page.getByRole("heading", { name: "Almost there", exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/create?bingo=${bingoId}`);
    const submissions = await page.evaluate(() =>
      Number(document.documentElement.dataset.tagControlSubmits),
    );
    expect(submissions).toBe(0);
    expect(errors).toEqual([]);
    await info.attach("tag-control-evidence", {
      body: JSON.stringify({
        width,
        layout,
        firstFocus,
        secondFocus,
        mutations,
        submissions,
        errors,
      }),
      contentType: "application/json",
    });
  });
}
