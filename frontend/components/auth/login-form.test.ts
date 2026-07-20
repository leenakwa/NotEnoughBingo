import { describe, expect, it } from "vitest";

import { safeNext } from "@/components/auth/login-form";

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
