import { expect, test, type Locator, type Page } from "@playwright/test";

import type { BingoDraft, MediaAsset, RevisionCell } from "../../lib/api/types";

// Native keyboard and validity checks with controlled API replies. These do not
// verify server persistence, publication, an OS input method, or a physical device.
const bingoId = "11111111-1111-4111-8111-111111111111";
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "keyboard_author",
  display_name: "Keyboard Author",
  avatar: null,
  email: "keyboard-author@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};
const image: MediaAsset = {
  id: "44444444-4444-4444-8444-444444444444",
  kind: "cell_image",
  status: "ready",
  url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvZUAAAAASUVORK5CYII=",
  mime_type: "image/png",
  width: 1,
  height: 1,
};
const retainedDescription = "Keep description <>& Привет";
const retainedTag = "keep tag";
const retainedCellText = "Keep this sibling cell";

async function controlledEditor(page: Page, width: number, title: string) {
  const errors: string[] = [];
  const publications: { path: string; method: string }[] = [];
  const draftSaves: { title: string; language: string; description: string }[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  const draft: BingoDraft = {
    id: "33333333-3333-4333-8333-333333333333",
    bingo_id: bingoId,
    title,
    description: title ? retainedDescription : "",
    language: "",
    size: 3,
    visibility: "private",
    completion_style: "checkmark",
    board_background: null,
    cover: null,
    tags: [{ id: "tag-1", name: retainedTag, slug: "keep-tag" }],
    cells: Array.from({ length: 9 }, (_, index) => ({
      row: Math.floor(index / 3),
      column: index % 3,
      text: index === 1 ? retainedCellText : "",
      text_color: "#17211b",
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      background_color: "#ffffff",
      background_opacity: 1,
      image: index === 0 ? image : null,
      image_alt: "",
      image_opacity: 1,
      border_color: "#17211b",
      border_width: 1,
      border_style: "solid",
    })),
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
      const payload = route.request().postDataJSON() as {
        title: string;
        description: string;
        language: string;
        tags: string[];
        cells: (Omit<RevisionCell, "image"> & { image_asset_id: string | null })[];
      };
      draftSaves.push({
        title: payload.title,
        description: payload.description,
        language: payload.language,
      });
      Object.assign(draft, {
        title: payload.title,
        description: payload.description,
        language: payload.language,
        tags: payload.tags.map((name, index) => ({ id: String(index), name, slug: name })),
        cells: payload.cells.map(({ image_asset_id, ...cell }) => ({
          ...cell,
          image: image_asset_id === image.id ? image : null,
        })),
        version: draft.version + 1,
      });
      return route.fulfill({ json: draft });
    }
    if (path === `/api/v1/bingos/${bingoId}/publish/` && method === "POST") {
      publications.push({ path, method });
      // Keep the editor visible after proving corrected input reaches the API.
      return route.fulfill({
        status: 422,
        json: {
          error: {
            code: "validation_error",
            message: "Controlled publish response.",
            details: {},
          },
        },
      });
    }
    expect(method, `Unexpected editor keyboard mutation of ${path}`).toBe("GET");
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
    throw new Error(`Unexpected editor keyboard request: ${path}`);
  });
  const pageViewRecorded = page.waitForResponse("**/api/v1/interactions/");
  await page.goto(`/create?bingo=${bingoId}`);
  await page.getByRole("button", { name: "Finish creating" }).click();
  await expect(page.getByRole("heading", { name: "Almost there", exact: true })).toBeVisible();
  expect((await pageViewRecorded).status()).toBe(204);
  await page.evaluate(() => {
    document.documentElement.dataset.editorNativeSubmits = "0";
    document.addEventListener("submit", () => {
      const root = document.documentElement;
      root.dataset.editorNativeSubmits = String(Number(root.dataset.editorNativeSubmits) + 1);
    });
  });
  return { errors, publications, draftSaves };
}

async function keyboardFocus(control: Locator) {
  await expect(control).toBeFocused();
  const style = await control.evaluate((element) => {
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

async function clearWithKeyboard(control: Locator) {
  await control.press("ControlOrMeta+A");
  await control.press("Backspace");
}

async function chooseEnglishWithKeyboard(language: Locator, isMobile: boolean) {
  if (isMobile) {
    await language.press("Space");
    await language.press("Home");
    await language.press("ArrowDown");
    await language.press("Enter");
  } else {
    await language.press("e");
  }
  await language.press("Tab");
  await expect(language).toHaveValue("en");
}

async function noNativeSubmissions(page: Page) {
  expect(
    await page.evaluate(() => Number(document.documentElement.dataset.editorNativeSubmits)),
  ).toBe(0);
}

for (const width of [320, 1710]) {
  test(`editor native keyboard respects details constraints and traversal at ${width}`, async ({
    page,
    isMobile,
  }, info) => {
    const evidence = await controlledEditor(page, width, "");
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    const language = page.getByRole("combobox", { name: "Bingo language", exact: true });
    const description = page.getByRole("textbox", { name: "Description optional", exact: true });
    const tag = page.getByRole("textbox", { name: "Tag", exact: true });
    const publish = page.getByRole("button", { name: "Publish bingo", exact: true });
    await expect(publish).toHaveAttribute("type", "button");
    expect(await title.evaluate((element: HTMLInputElement) => element.form)).toBeNull();
    const nativeConstraints = await page.locator(".details-panel").evaluate((panel) => {
      const titleInput = panel.querySelector<HTMLInputElement>("input[required]")!;
      const languageSelect = panel.querySelector<HTMLSelectElement>("select[required]")!;
      const descriptionInput = panel.querySelector<HTMLTextAreaElement>("textarea")!;
      return {
        panelTag: panel.tagName,
        title: {
          required: titleInput.required,
          maxLength: titleInput.maxLength,
          valueMissing: titleInput.validity.valueMissing,
          valid: titleInput.validity.valid,
        },
        language: {
          required: languageSelect.required,
          valueMissing: languageSelect.validity.valueMissing,
          valid: languageSelect.validity.valid,
        },
        description: {
          required: descriptionInput.required,
          maxLength: descriptionInput.maxLength,
          valid: descriptionInput.validity.valid,
        },
      };
    });
    expect(nativeConstraints).toEqual({
      panelTag: "SECTION",
      title: { required: true, maxLength: 70, valueMissing: true, valid: false },
      language: { required: true, valueMissing: true, valid: false },
      description: { required: false, maxLength: 500, valid: true },
    });
    await title.click();
    await title.pressSequentially("T".repeat(71));
    await expect(title).toHaveValue("T".repeat(70));
    expect(await title.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
    await title.press("Enter");
    await expect(page.getByRole("heading", { name: "Almost there", exact: true })).toBeVisible();
    expect(evidence.publications).toEqual([]);
    await page.keyboard.press("Tab");
    const languageFocus = await keyboardFocus(language);
    await chooseEnglishWithKeyboard(language, isMobile);
    const descriptionFocus = await keyboardFocus(description);
    await description.pressSequentially("D".repeat(501));
    await expect(description).toHaveValue("D".repeat(500));
    expect(
      await description.evaluate((element: HTMLTextAreaElement) => element.validity.valid),
    ).toBe(true);
    await clearWithKeyboard(description);
    await description.pressSequentially("First line");
    await description.press("Enter");
    await description.pressSequentially("Second line");
    await expect(description).toHaveValue("First line\nSecond line");
    await page.keyboard.press("Tab");
    const tagFocus = await keyboardFocus(tag);
    await expect(title).toHaveValue("T".repeat(70));
    await expect(language).toHaveValue("en");
    await expect(page.getByRole("group", { name: "Selected tags" })).toContainText(retainedTag);
    expect(evidence.publications).toEqual([]);
    await noNativeSubmissions(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(evidence.errors).toEqual([]);
    await info.attach("editor-native-constraints-evidence", {
      body: JSON.stringify({
        width,
        nativeConstraints,
        languageFocus,
        descriptionFocus,
        tagFocus,
        ...evidence,
      }),
      contentType: "application/json",
    });
  });

  test(`editor keyboard publication focuses errors in order and retains siblings at ${width}`, async ({
    page,
    isMobile,
  }, info) => {
    const evidence = await controlledEditor(page, width, "   ");
    const title = page.getByRole("textbox", { name: "Title", exact: true });
    const language = page.getByRole("combobox", { name: "Bingo language", exact: true });
    const description = page.getByRole("textbox", { name: "Description optional", exact: true });
    const publish = page.getByRole("button", { name: "Publish bingo", exact: true });
    // Native required accepts whitespace; publication applies its trimmed-title rule.
    expect(await title.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(true);
    await publish.press("Enter");
    await expect(title).toBeFocused();
    await expect(title).toHaveValue("   ");
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toHaveAccessibleDescription(
      "Up to 70 characters. Add a title before publishing.",
    );
    await expect(page.locator("#bingo-title-error")).toHaveAttribute("role", "alert");
    await expect(language).toHaveValue("");
    await expect(description).toHaveValue(retainedDescription);
    await expect(page.getByRole("textbox", { name: "Image description", exact: true })).toHaveCount(
      0,
    );
    expect(evidence.publications).toEqual([]);
    await clearWithKeyboard(title);
    await title.pressSequentially("Keyboard image board");
    await expect(title).toHaveAttribute("aria-invalid", "false");
    await expect(page.locator("#bingo-title-error")).toHaveCount(0);
    await expect(title).toHaveAccessibleDescription("Up to 70 characters.");
    await publish.press("Enter");
    await expect(language).toBeFocused();
    await expect(language).toHaveAttribute("aria-invalid", "true");
    await expect(language).toHaveAccessibleDescription(
      "Choose a bingo language before publishing.",
    );
    await expect(page.locator("#bingo-language-error")).toHaveAttribute("role", "alert");
    await expect(title).toHaveValue("Keyboard image board");
    await expect(description).toHaveValue(retainedDescription);
    await expect(page.getByRole("group", { name: "Selected tags" })).toContainText(retainedTag);
    await expect(page.getByRole("textbox", { name: "Image description", exact: true })).toHaveCount(
      0,
    );
    expect(evidence.publications).toEqual([]);
    await chooseEnglishWithKeyboard(language, isMobile);
    await expect(language).toHaveAttribute("aria-invalid", "false");
    await expect(page.locator("#bingo-language-error")).toHaveCount(0);
    await publish.press("Enter");
    const imageDescription = page.getByRole("textbox", { name: "Image description", exact: true });
    await expect(imageDescription).toBeFocused();
    await expect(imageDescription).toHaveAttribute("aria-invalid", "true");
    await expect(imageDescription).toHaveAccessibleDescription(
      "Required for image-only cells so everyone can understand them. Up to 160 characters. Describe this image-only cell before publishing.",
    );
    await expect(page.locator("#cell-image-description-error")).toHaveAttribute("role", "alert");
    await expect(page.getByRole("gridcell").nth(1)).toContainText(retainedCellText);
    expect(evidence.publications).toEqual([]);
    await imageDescription.pressSequentially("A controlled fixture image");
    await expect(imageDescription).toHaveAttribute("aria-invalid", "false");
    await expect(page.locator("#cell-image-description-error")).toHaveCount(0);
    await expect(imageDescription).toHaveAccessibleDescription(
      "Required for image-only cells so everyone can understand them. Up to 160 characters.",
    );
    await page.getByRole("button", { name: "Finish creating" }).press("Enter");
    await expect(title).toHaveValue("Keyboard image board");
    await expect(language).toHaveValue("en");
    await expect(description).toHaveValue(retainedDescription);
    await expect(page.getByRole("group", { name: "Selected tags" })).toContainText(retainedTag);
    expect(evidence.publications).toEqual([]);
    await publish.press("Enter");
    await expect.poll(() => evidence.publications.length).toBe(1);
    await expect(page.getByText("Controlled publish response.", { exact: true })).toBeVisible();
    await expect(title).toHaveValue("Keyboard image board");
    await expect(description).toHaveValue(retainedDescription);
    await noNativeSubmissions(page);
    expect(evidence.errors).toEqual([]);
    await info.attach("editor-keyboard-validation-evidence", {
      body: JSON.stringify({
        width,
        title: await title.inputValue(),
        language: await language.inputValue(),
        description: await description.inputValue(),
        ...evidence,
      }),
      contentType: "application/json",
    });
  });
}
