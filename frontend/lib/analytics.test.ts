import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({ api: { analytics: { record: vi.fn() } } }));

const eventId = "9ea4b813-09fc-4cc4-ae13-9674c4f48f15";
const anonymousId = "ee038e8e-9481-4706-a69e-ecdc9cf5e627";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  window.localStorage.clear();
  vi.mocked(api.analytics.record).mockReset().mockResolvedValue({ accepted: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("optional interaction analytics", () => {
  it.each([undefined, {}])(
    "skips events when browser UUID support is absent (%s)",
    async (crypto) => {
      vi.stubGlobal("crypto", crypto);
      const { trackInteraction } = await import("@/lib/analytics");

      expect(() => trackInteraction("page_view")).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(600);
      expect(api.analytics.record).not.toHaveBeenCalled();
    },
  );

  it("skips events when generating their UUID throws", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => {
        throw new Error("UUID unavailable");
      }),
    });
    const { trackInteraction } = await import("@/lib/analytics");

    expect(() => trackInteraction("page_view")).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(api.analytics.record).not.toHaveBeenCalled();
  });

  it("skips the entire event when anonymous UUID generation fails after its event UUID succeeds", async () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce(eventId)
      .mockImplementation(() => {
        throw new Error("UUID unavailable");
      });
    vi.stubGlobal("crypto", { randomUUID });
    const { trackInteraction } = await import("@/lib/analytics");

    expect(() => trackInteraction("page_view")).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(600);
    expect(api.analytics.record).not.toHaveBeenCalled();
  });

  it("keeps a valid queued event and its normal delayed flush when a later UUID fails", async () => {
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce(eventId)
      .mockReturnValueOnce(anonymousId)
      .mockImplementation(() => {
        throw new Error("UUID unavailable");
      });
    vi.stubGlobal("crypto", { randomUUID });
    vi.setSystemTime(new Date("2026-10-08T10:00:00.000Z"));
    const { trackInteraction } = await import("@/lib/analytics");
    trackInteraction("page_view", { tag: "test-tag", metadata: { surface: "shared" } });
    const queuedTimers = vi.getTimerCount();

    expect(() => trackInteraction("page_view")).not.toThrow();
    expect(vi.getTimerCount()).toBe(queuedTimers);
    await vi.advanceTimersByTimeAsync(599);
    expect(api.analytics.record).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.analytics.record).toHaveBeenCalledExactlyOnceWith([
      {
        client_event_id: eventId,
        event_type: "page_view",
        bingo_id: undefined,
        revision_id: undefined,
        tag: "test-tag",
        metadata: { surface: "shared" },
        occurred_at: "2026-10-08T10:00:00.000Z",
        anonymous_id: anonymousId,
      },
    ]);
  });

  it("flushes twenty successful events immediately and preserves their UUIDs", async () => {
    const ids = Array.from(
      { length: 20 },
      (_, index) => `9ea4b813-09fc-4cc4-ae13-${String(index).padStart(12, "0")}`,
    );
    const randomUUID = vi.fn().mockReturnValueOnce(ids[0]).mockReturnValueOnce(anonymousId);
    for (const id of ids.slice(1)) randomUUID.mockReturnValueOnce(id);
    vi.stubGlobal("crypto", { randomUUID });
    const { trackInteraction } = await import("@/lib/analytics");

    for (let index = 0; index < 19; index++) trackInteraction("page_view");
    expect(api.analytics.record).not.toHaveBeenCalled();
    trackInteraction("page_view");
    expect(api.analytics.record).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(api.analytics.record).mock.calls[0]?.[0].map((event) => event.client_event_id),
    ).toEqual(ids);
    expect(
      vi
        .mocked(api.analytics.record)
        .mock.calls[0]?.[0].every((event) => event.anonymous_id === anonymousId),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(api.analytics.record).toHaveBeenCalledTimes(1);
  });

  it("uses a stable in-memory anonymous UUID when local storage is denied", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage denied");
    });
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce(eventId)
        .mockReturnValueOnce(anonymousId)
        .mockReturnValueOnce(eventId),
    });
    const { trackInteraction } = await import("@/lib/analytics");

    trackInteraction("page_view");
    trackInteraction("page_view");
    await vi.advanceTimersByTimeAsync(600);
    expect(api.analytics.record).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(api.analytics.record).mock.calls[0]?.[0].map((event) => event.anonymous_id),
    ).toEqual([anonymousId, anonymousId]);
  });
});
