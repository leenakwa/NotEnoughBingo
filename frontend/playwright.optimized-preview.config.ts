import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.OPTIMIZED_PREVIEW_BASE_URL;
if (!baseURL) throw new Error("OPTIMIZED_PREVIEW_BASE_URL is required");
const previewURL = new URL(baseURL);
if (
  previewURL.protocol !== "http:" ||
  !["127.0.0.1", "localhost", "[::1]"].includes(previewURL.hostname) ||
  previewURL.username ||
  previewURL.password ||
  previewURL.pathname !== "/" ||
  previewURL.search ||
  previewURL.hash
) {
  throw new Error("OPTIMIZED_PREVIEW_BASE_URL must be the actual loopback HTTP origin");
}
if (!process.env.OPTIMIZED_PREVIEW_PROVENANCE) {
  throw new Error("OPTIMIZED_PREVIEW_PROVENANCE is required");
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /live-optimized-preview\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  outputDir: "optimized-preview-test-results",
  reporter: [
    ["html", { open: "never", outputFolder: "optimized-preview-playwright-report" }],
    ["list"],
  ],
  use: {
    baseURL: previewURL.origin,
    storageState: { cookies: [], origins: [] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "optimized-preview-chromium", use: { ...devices["Desktop Chrome"] } }],
});
