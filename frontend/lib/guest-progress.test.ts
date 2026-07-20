import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearGuestProgress, readGuestProgress, writeGuestProgress } from "@/lib/guest-progress";

describe("guest progress", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("stores only browser-local guest selections", () => {
    writeGuestProgress("bingo-1", "revision-1", ["0:0", "1:1"]);
    expect(readGuestProgress("bingo-1", "revision-1")?.selected_cells).toEqual(["0:0", "1:1"]);
  });

  it("drops progress when the published revision changes", () => {
    writeGuestProgress("bingo-1", "revision-1", ["0:0"]);
    expect(readGuestProgress("bingo-1", "revision-2")).toBeNull();
  });

  it("rejects malformed browser-local cell identifiers", () => {
    writeGuestProgress("bingo-1", "revision-1", ["0:0"]);
    const storageKey = window.localStorage.key(0);
    expect(storageKey).not.toBeNull();
    window.localStorage.setItem(
      storageKey!,
      JSON.stringify({
        bingo_id: "bingo-1",
        revision_id: "revision-1",
        selected_cells: [{ unexpected: true }],
        updated_at: new Date().toISOString(),
      }),
    );

    expect(readGuestProgress("bingo-1", "revision-1")).toBeNull();
  });

  it("resets without touching any shared result", () => {
    writeGuestProgress("bingo-1", "revision-1", ["0:0"]);
    clearGuestProgress("bingo-1");
    expect(readGuestProgress("bingo-1", "revision-1")).toBeNull();
  });

  it("fails safely when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });

    expect(writeGuestProgress("bingo-1", "revision-1", ["0:0"])).toBe(false);
  });
});
