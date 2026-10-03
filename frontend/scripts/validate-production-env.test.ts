import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const validator = join(process.cwd(), "scripts", "validate-production-env.mjs");

function validate(overrides: Record<string, string | undefined> = {}, builtRelease?: string) {
  const cwd = mkdtempSync(join(tmpdir(), "neb-production-env-"));
  try {
    if (builtRelease !== undefined) writeFileSync(join(cwd, ".built-release"), builtRelease);
    return spawnSync(process.execPath, [validator], {
      cwd,
      encoding: "utf8",
      env: {
        NODE_ENV: "production",
        APP_ENVIRONMENT: "production",
        NEXT_PUBLIC_APP_URL: "https://bingo.example.com",
        NEXT_PUBLIC_APP_RELEASE: "a".repeat(40),
        NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com",
        NEXT_PUBLIC_API_BASE_URL: "/api/v1",
        API_BASE_URL: "http://backend:8000/api/v1",
        ...overrides,
      },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("production API destination validation", () => {
  it.each([undefined, "", "main", "a".repeat(39), "a".repeat(41), "A".repeat(40)])(
    "rejects an absent or mutable build identity: %s",
    (release) => {
      expect(validate({ NEXT_PUBLIC_APP_RELEASE: release }).status).toBe(1);
    },
  );

  it("accepts its built release and rejects relabeling an existing image", () => {
    expect(validate({}, "a".repeat(40) + "\n").status).toBe(0);
    expect(validate({ NEXT_PUBLIC_APP_RELEASE: "b".repeat(40) }, "a".repeat(40)).status).toBe(1);
  });

  it("accepts a same-origin browser path and explicit backend service", () => {
    expect(validate().status).toBe(0);
  });

  it.each([
    { NEXT_PUBLIC_APP_URL: "https://[::1]" },
    { NEXT_PUBLIC_APP_URL: "https://staging.example.com" },
    { NEXT_PUBLIC_API_BASE_URL: "https://staging.example.com/api/v1" },
    { NEXT_PUBLIC_API_BASE_URL: "/api/v2" },
    { API_BASE_URL: undefined },
    { API_BASE_URL: "http://127.0.0.1:8000/api/v1" },
    { API_BASE_URL: "http://[::1]:8000/api/v1" },
    { API_BASE_URL: "https://api-staging.example.com/api/v1" },
    { API_BASE_URL: "https://backend.example.test/api/v1" },
  ])("rejects an unsafe API destination: %j", (overrides) => {
    expect(validate(overrides).status).toBe(1);
  });
});
