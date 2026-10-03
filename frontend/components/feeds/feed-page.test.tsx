import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { FeedPage } from "@/components/feeds/feed-page";
import { AUTH_SIGNED_IN_EVENT } from "@/lib/auth-events";
import type { BingoSummary, Page } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({ discover: vi.fn() }));
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
