import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { FeedPage } from "@/components/feeds/feed-page";
import { AUTH_SIGNED_IN_EVENT } from "@/lib/auth-events";
import type { BingoSummary, Page } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  discover: vi.fn<(page: number, signal: AbortSignal) => Promise<Page<BingoSummary>>>(),
}));
vi.mock("@/lib/api/client", () => ({
  api: { feeds: { discover: mocks.discover } },
  errorMessage: () => "Feed unavailable.",
}));
vi.mock("@/components/bingo/bingo-grid", () => ({
  BingoGrid: ({ bingos }: { bingos: BingoSummary[] }) => (
    <div>
      {bingos.map((board) => (
        <p key={board.id}>{board.title}</p>
      ))}
    </div>
  ),
}));

function page(title: string): Page<BingoSummary> {
  return { count: 1, next: null, previous: null, results: [{ id: title, title } as BingoSummary] };
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

it("does not restore an obsolete recommendation response after sign-in refresh", async () => {
  let resolveOld: (value: Page<BingoSummary>) => void = () => undefined;
  mocks.discover.mockReturnValueOnce(
    new Promise((done) => {
      resolveOld = done;
    }),
  );
  mocks.discover.mockResolvedValueOnce(page("Current recommendations"));
  render(<FeedPage kind="discover" title="Discover" description="Public boards" />);
  await act(async () => window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT)));
  expect(screen.getByText("Current recommendations")).toBeVisible();
  await act(async () => resolveOld(page("Obsolete recommendations")));
  expect(screen.getByText("Current recommendations")).toBeVisible();
  expect(screen.queryByText("Obsolete recommendations")).not.toBeInTheDocument();
});

it("cancels a pending read on pagehide and reloads after a persisted pageshow", async () => {
  let rejectOld: (reason: unknown) => void = () => undefined;
  mocks.discover.mockReturnValueOnce(
    new Promise((_, reject) => {
      rejectOld = reject;
    }),
  );
  mocks.discover.mockResolvedValueOnce(page("Restored recommendations"));
  render(<FeedPage kind="discover" title="Discover" description="Public boards" />);
  const originalSignal = mocks.discover.mock.calls[0]?.[1];

  await act(async () => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  expect(originalSignal?.aborted).toBe(true);
  await act(async () => rejectOld(new DOMException("Read cancelled", "AbortError")));
  expect(screen.queryByText("Feed unavailable.")).not.toBeInTheDocument();

  await act(async () =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  expect(mocks.discover).toHaveBeenCalledTimes(2);
  const restoredSignal = mocks.discover.mock.calls[1]?.[1];
  expect(restoredSignal?.aborted).toBe(false);
  expect(screen.getByText("Restored recommendations")).toBeVisible();
  expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
});

it("skips the initial server-rendered result and revalidates it on a persisted pageshow", async () => {
  mocks.discover.mockResolvedValueOnce(page("Fresh recommendations"));
  render(
    <FeedPage
      kind="discover"
      title="Discover"
      description="Public boards"
      initialResult={page("Server recommendations")}
    />,
  );
  expect(mocks.discover).not.toHaveBeenCalled();
  expect(screen.getByText("Server recommendations")).toBeVisible();

  await act(async () =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })),
  );
  expect(mocks.discover).not.toHaveBeenCalled();

  await act(async () =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  expect(mocks.discover).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Fresh recommendations")).toBeVisible();
});

it("restarts the current page after a persisted restoration", async () => {
  mocks.discover.mockReturnValueOnce(new Promise(() => undefined));
  mocks.discover.mockResolvedValueOnce(page("Second page recommendations"));
  render(
    <FeedPage
      kind="discover"
      title="Discover"
      description="Public boards"
      initialResult={{ ...page("First page recommendations"), next: "/feeds/discover/?page=2" }}
    />,
  );
  await act(async () => screen.getByRole("button", { name: "Next" }).click());
  expect(mocks.discover).toHaveBeenLastCalledWith(2, expect.any(AbortSignal));

  await act(async () => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  await act(async () =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  expect(mocks.discover).toHaveBeenCalledTimes(2);
  expect(mocks.discover).toHaveBeenLastCalledWith(2, expect.any(AbortSignal));
  expect(screen.getByText("Second page recommendations")).toBeVisible();
});

it("removes the document lifecycle listeners and cancels the read when unmounted", async () => {
  mocks.discover.mockReturnValueOnce(new Promise(() => undefined));
  const added = vi.spyOn(window, "addEventListener");
  const removed = vi.spyOn(window, "removeEventListener");
  const view = render(<FeedPage kind="discover" title="Discover" description="Public boards" />);
  const signal = mocks.discover.mock.calls[0]?.[1];
  const pagehide = added.mock.calls.find(([event]) => event === "pagehide")?.[1];
  const pageshow = added.mock.calls.find(([event]) => event === "pageshow")?.[1];
  expect(pagehide).toBeDefined();
  expect(pageshow).toBeDefined();

  view.unmount();
  expect(signal?.aborted).toBe(true);
  expect(removed).toHaveBeenCalledWith("pagehide", pagehide);
  expect(removed).toHaveBeenCalledWith("pageshow", pageshow);
  await act(async () =>
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })),
  );
  expect(mocks.discover).toHaveBeenCalledTimes(1);
});
