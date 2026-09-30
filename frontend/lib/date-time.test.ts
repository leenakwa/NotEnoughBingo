import { afterEach, describe, expect, it, vi } from "vitest";

import { formatLocalDateTime } from "@/lib/date-time";

describe("local date and time", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("distinguishes repeated times when daylight saving ends", () => {
    vi.stubEnv("TZ", "America/New_York");

    const first = formatLocalDateTime("2024-11-03T05:30:00Z");
    const second = formatLocalDateTime("2024-11-03T06:30:00Z");

    expect(first).toContain("1:30");
    expect(second).toContain("1:30");
    expect(first).not.toBe(second);
    expect(first).toContain("EDT");
    expect(second).toContain("EST");
  });

  it("crosses spring daylight saving and calendar boundaries without shifting the instant", () => {
    vi.stubEnv("TZ", "America/New_York");
    expect(formatLocalDateTime("2024-03-10T06:59:00Z")).toContain("1:59");
    expect(formatLocalDateTime("2024-03-10T07:01:00Z")).toContain("3:01");

    vi.stubEnv("TZ", "UTC");
    expect(formatLocalDateTime("2024-02-29T23:59:00Z")).toContain("Feb 29, 2024");
    expect(formatLocalDateTime("2024-03-01T00:01:00Z")).toContain("Mar 1, 2024");
    expect(formatLocalDateTime("2024-12-31T23:59:00Z")).toContain("Dec 31, 2024");
    expect(formatLocalDateTime("2025-01-01T00:01:00Z")).toContain("Jan 1, 2025");
  });

  it("does not expose an invalid date for a malformed API value", () => {
    expect(formatLocalDateTime("invalid")).toBe("Date unavailable");
  });
});
