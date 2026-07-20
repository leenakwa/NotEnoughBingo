import { defineConfig, devices } from "@playwright/test";

const live = process.env.E2E_LIVE === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: live ? 90_000 : 30_000,
  fullyParallel: !live,
  forbidOnly: Boolean(process.env.CI),
  retries: live ? 0 : process.env.CI ? 2 : 0,
  workers: live || process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  globalSetup: live ? "./tests/e2e/live-global-setup.ts" : undefined,
  use: {
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ?? (live ? "http://localhost:8080" : "http://127.0.0.1:3000"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: live
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: live
    ? [
        {
          name: "live-chromium",
          testMatch: /live-product-flows\.spec\.ts/,
          use: { ...devices["Desktop Chrome"] },
        },
      ]
    : [
        {
          name: "chromium",
          testIgnore: /live-product-flows\.spec\.ts/,
          use: { ...devices["Desktop Chrome"] },
        },
        {
          name: "mobile",
          testIgnore: /live-product-flows\.spec\.ts/,
          use: { ...devices["Pixel 7"] },
        },
      ],
});
