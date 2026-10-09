import { describe, expect, it } from "vitest";

import { formatCount } from "@/lib/format-count";

describe("compact count formatting", () => {
  it("shows zero, small counts, and rounded large counts intentionally", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1)).toBe("1");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1_500)).toBe("1.5K");
    expect(formatCount(1_000_000)).toBe("1M");
    expect(formatCount(1_000_000_000)).toBe("1B");
  });

  it("never shows an impossible count as a number", () => {
    for (const value of [-1, 0.001, null, undefined, NaN, Infinity, -Infinity]) {
      expect(formatCount(value)).toBe("—");
    }
  });
});
