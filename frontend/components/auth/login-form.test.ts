import { describe, expect, it } from "vitest";

import { loginNotice, safeNext } from "@/components/auth/login-form";

describe("safeNext", () => {
  it("keeps local product destinations", () => {
    expect(safeNext("/bingo/123?mode=play#comments")).toBe("/bingo/123?mode=play#comments");
  });

  it.each(["//example.test", "/\\example.test", "https://example.test", null])(
    "rejects an unsafe post-login destination",
    (destination) => {
      expect(safeNext(destination)).toBe("/discover");
    },
  );
});

describe("loginNotice", () => {
  it("explains the re-authentication step after scheduling deletion", () => {
    expect(loginNotice("deletion-scheduled")).toContain("all sessions were signed out");
    expect(loginNotice("deletion-scheduled")).toContain("cancel it during the grace period");
  });

  it("does not display a notice for arbitrary reasons", () => {
    expect(loginNotice("unexpected")).toBe("");
    expect(loginNotice(null)).toBe("");
  });
});
