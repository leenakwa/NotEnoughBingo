import { expect, test } from "@playwright/test";

test.use({ timezoneId: "America/New_York" });

test("notifications show the viewer's timezone across a repeated DST hour", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/v1/auth/session/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"user":null}' }),
  );
  await page.route("**/api/v1/notifications/unread-count/", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"count":0}' }),
  );
  await page.route(/\/api\/v1\/notifications\/\?/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            message: "First activity",
            target_url: "/discover",
            created_at: "2024-11-03T05:30:00Z",
            read_at: "2024-11-03T05:30:00Z",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            message: "Second activity",
            target_url: "/discover",
            created_at: "2024-11-03T06:30:00Z",
            read_at: "2024-11-03T06:30:00Z",
          },
        ],
      }),
    }),
  );

  await page.goto("/notifications");
  const times = page.locator(".notification-list time");
  await expect(times).toHaveCount(2);
  await expect(times.nth(0)).toContainText("1:30 AM EDT");
  await expect(times.nth(1)).toContainText("1:30 AM EST");
  await expect(times.nth(0)).toHaveAttribute("dateTime", "2024-11-03T05:30:00Z");
  expect(pageErrors).toEqual([]);
});
