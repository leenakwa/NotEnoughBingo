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
        env: {
          AGENTATION_ENABLED: "false",
          // Static scenarios mock browser requests; server rendering must not
          // accidentally read an unrelated developer API on port 8000.
          API_BASE_URL: "http://127.0.0.1:1/api/v1",
        },
      },
  projects: live
    ? [
        {
          name: "live-chromium",
          testMatch: /live-product-flows\.spec\.ts/,
          use: { ...devices["Desktop Chrome"] },
        },
        {
          name: "live-mobile-webkit",
          testMatch: /live-mobile-webkit\.spec\.ts/,
          use: { ...devices["iPhone 13"] },
        },
      ]
    : [
        {
          name: "chromium",
          testIgnore: /live-.*\.spec\.ts/,
          use: { ...devices["Desktop Chrome"] },
        },
        {
          name: "mobile",
          testIgnore: /live-.*\.spec\.ts/,
          use: { ...devices["Pixel 7"] },
        },
        {
          name: "firefox",
          testIgnore: /live-.*\.spec\.ts/,
          use: { ...devices["Desktop Firefox"] },
        },
        {
          name: "webkit",
          testIgnore: /live-.*\.spec\.ts/,
          use: { ...devices["Desktop Safari"] },
        },
      ],
});
