import { expect, test } from "@playwright/test";

// Controlled validation replies exercise the real editor, not server persistence.
const bingoId = "11111111-1111-4111-8111-111111111111";
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "validation_author",
  display_name: "Validation Author",
  avatar: null,
  email: "validation-author@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};

for (const scenario of [
  {
    label: "Cover image",
    details: {
      cover_asset_id: [{ message: "Choose an available image.", code: "asset_unavailable" }],
    },
  },
  {
    label: "Background",
    details: {
      board_background_id: [{ message: "Choose an available image.", code: "asset_unavailable" }],
    },
  },
  {
    label: "Cell image",
    details: {
      cells: [
        {
          image_asset_id: [{ message: "Choose an available image.", code: "asset_unavailable" }],
        },
      ],
    },
  },
]) {
  test(`failed save identifies ${scenario.label} and remains retryable`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let saves = 0;
    const savedTitles: string[] = [];
    const draft = {
      id: "33333333-3333-4333-8333-333333333333",
      bingo_id: bingoId,
      title: "Validation fixture",
      description: "",
      language: "en",
      size: 3,
      visibility: "private",
      completion_style: "checkmark",
      board_background: null,
      cover: null,
      tags: [],
      cells: [],
      updated_at: "2026-10-09T00:00:00Z",
      version: 1,
    };
    await page.route("**/api/v1/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      const method = route.request().method();
      if (path === "/api/v1/interactions/") return route.fulfill({ status: 204, body: "" });
      if (path === `/api/v1/bingos/${bingoId}/draft/` && method === "PUT") {
        expect(route.request().headers()["x-csrftoken"]).toBe("test");
        saves += 1;
        const payload = route.request().postDataJSON() as { title: string };
        savedTitles.push(payload.title);
        if (saves === 1) {
          return route.fulfill({
            status: 400,
            json: {
              error: {
                code: "validation_error",
                message: "Invalid input.",
                details: scenario.details,
              },
            },
          });
        }
        draft.title = payload.title;
        draft.version += 1;
        return route.fulfill({ json: draft });
      }
      expect(method, `Unexpected editor mutation of ${path}`).toBe("GET");
      if (path === "/api/v1/auth/session/") return route.fulfill({ json: { user } });
      if (path === "/api/v1/auth/me/") return route.fulfill({ json: user });
      if (path === "/api/v1/auth/csrf/") return route.fulfill({ json: { csrf: "test" } });
      if (path === "/api/v1/profiles/me/") {
        return route.fulfill({
          json: { ...user, preferred_languages: ["en"], language_preferences_confirmed: true },
        });
      }
      if (path === "/api/v1/notifications/unread-count/")
        return route.fulfill({ json: { unread_count: 0 } });
      if (path === `/api/v1/bingos/${bingoId}/draft/`) return route.fulfill({ json: draft });
      if (path === `/api/v1/bingos/${bingoId}/`)
        return route.fulfill({ json: { id: bingoId, current_revision: null } });
      throw new Error(`Unexpected editor validation request: ${path}`);
    });

    await page.goto(`/create?bingo=${bingoId}`);
    await page.getByRole("button", { name: "Finish creating" }).click();
    const title = page.getByLabel("Title", { exact: true });
    await title.fill("Retained title after validation");
    const failure = page.getByRole("alert").filter({ hasText: "Save failed — Retry" });
    await expect(failure).toBeVisible();
    await expect(failure).toContainText(`${scenario.label}: Choose an available image.`);
    await expect(failure).not.toContainText(
      /asset[_ ]id|cover[_ ]id|board[_ ]background[_ ]id|avatar[_ ]id|asset_unavailable|validation_error/,
    );
    await expect(title).toHaveValue("Retained title after validation");
    await expect(failure.getByRole("button", { name: "Retry now" })).toBeEnabled();
    expect(saves).toBe(1);

    await failure.getByRole("button", { name: "Retry now" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(failure).toHaveCount(0);
    await expect(title).toHaveValue("Retained title after validation");
    expect(saves).toBe(2);
    expect(savedTitles).toEqual([
      "Retained title after validation",
      "Retained title after validation",
    ]);
    expect(errors).toEqual([]);
  });
}
