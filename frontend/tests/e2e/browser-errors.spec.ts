import { expect, test } from "@playwright/test";

test("browser exceptions, rejections and API failures are reported without private content", async ({
  page,
}) => {
  const reports: Record<string, unknown>[] = [];
  const releases: (string | undefined)[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/v1/auth/session/", (route) => route.fulfill({ json: { user: null } }));
  await page.route("**/api/v1/auth/csrf/", (route) =>
    route.fulfill({ json: { csrf: "synthetic-token" } }),
  );
  await page.route("**/api/v1/interactions/", (route) => route.fulfill({ status: 204 }));
  await page.route("**/api/v1/client-errors/", (route) => {
    reports.push(route.request().postDataJSON());
    releases.push(route.request().headers()["x-neb-client-release"]);
    return route.fulfill({ status: 204 });
  });
  await page.route("**/api/v1/auth/login/", (route) => route.fulfill({ status: 503 }));
  const sessionCheck = page.waitForResponse("**/api/v1/auth/session/");
  await page.goto("/support?private-marker=secret#private-marker");
  await sessionCheck;
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Log in", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const chunk = Array.from(document.scripts).find((script) =>
      script.src.includes("/_next/static/chunks/"),
    )?.src;
    if (!chunk) throw new Error("Application chunk missing");
    const error = new TypeError("private-marker browser exception");
    error.stack = `TypeError: private-marker\n at fn (${chunk}?private-marker:14:8)`;
    window.setTimeout(() => {
      throw error;
    }, 0);
  });
  await expect.poll(() => reports.some((report) => report.kind === "exception")).toBe(true);
  const exception = reports.find((report) => report.kind === "exception")!;
  expect(exception.error_type).toBe("TypeError");
  expect(exception.frames).toEqual([expect.objectContaining({ lineno: 14, colno: 8 })]);
  await page.evaluate(() => {
    window.setTimeout(() => {
      void Promise.reject("private-marker rejected promise");
    }, 0);
  });
  await expect.poll(() => reports.some((report) => report.kind === "rejection")).toBe(true);
  await page.getByLabel("Email", { exact: true }).fill("synthetic@example.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect
    .poll(() => reports.some((report) => report.kind === "api" && report.status_code === 503))
    .toBe(true);
  expect(reports).toHaveLength(3);
  expect(releases).toEqual(Array(3).fill(process.env.NEXT_PUBLIC_APP_RELEASE ?? "a".repeat(40)));
  expect(reports.every((report) => report.surface === "support")).toBe(true);
  expect(JSON.stringify(reports)).not.toMatch(
    /private-marker|synthetic-password|synthetic@example/,
  );
  expect(pageErrors.length).toBeGreaterThan(0);
  expect(pageErrors.every((error) => error.includes("private-marker"))).toBe(true);

  await page.route("**/api/v1/client-errors/", (route) => route.abort("failed"));
  const failedReport = page.waitForEvent("requestfailed", {
    predicate: (request) => request.url().endsWith("/api/v1/client-errors/"),
  });
  await page.evaluate(() => {
    window.dispatchEvent(new ErrorEvent("error", { error: new RangeError("private-marker") }));
  });
  await failedReport;
  await page.getByRole("button", { name: "Close account dialog" }).click();
  await expect(page.getByRole("heading", { name: "Support & Moderation" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(pageErrors.every((error) => error.includes("private-marker"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
