import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExplorePage } from "@/components/explore/explore-page";
import type { BingoSummary, Page } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  query: "",
  replace: vi.fn(),
  explore: vi.fn(),
  authors: vi.fn(),
  tags: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock("@/lib/analytics", () => ({ trackInteraction: vi.fn() }));
vi.mock("@/components/bingo/bingo-grid", () => ({
  BingoGrid: ({ bingos }: { bingos: BingoSummary[] }) => (
    <div>
      {bingos.map((board) => (
        <p key={board.id}>{board.title}</p>
      ))}
    </div>
  ),
}));
vi.mock("@/lib/api/client", () => ({
  api: {
    bingos: { explore: mocks.explore },
    authors: { list: mocks.authors },
    tags: { list: mocks.tags },
  },
  errorMessage: () => "Catalog unavailable.",
}));

function page<T>(results: T[]): Page<T> {
  return { count: results.length, next: null, previous: null, results };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.query = "";
  mocks.explore.mockResolvedValue(page([]));
  mocks.authors.mockResolvedValue(page([]));
  mocks.tags.mockResolvedValue(page([]));
});
afterEach(() => vi.useRealTimers());

describe("Explore partial and obsolete responses", () => {
  it.each([
    {
      label: "Author",
      request: "authors",
      list: "explore-author-suggestions",
      row: (name: string) => ({ id: name, username: name, display_name: name, avatar: null }),
    },
    {
      label: "Tags",
      request: "tags",
      list: "explore-tag-suggestions",
      row: (name: string) => ({ id: name, name, slug: name }),
    },
  ] as const)(
    "does not restore stale $label suggestions after the field changes",
    async (scenario) => {
      let resolveOld: (value: unknown) => void = () => undefined;
      mocks[scenario.request].mockReturnValueOnce(
        new Promise((done) => {
          resolveOld = done;
        }),
      );
      mocks[scenario.request].mockResolvedValueOnce(page([scenario.row("current")]));
      render(<ExplorePage initialResult={page([])} />);
      const input = screen.getByLabelText(scenario.label, { exact: true });
      fireEvent.change(input, { target: { value: "obsolete" } });
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      fireEvent.change(input, { target: { value: "current" } });
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      const options = () =>
        Array.from(
          document.querySelectorAll<HTMLOptionElement>(`#${scenario.list} option`),
          (option) => option.value,
        );
      expect(options()).toEqual(["current"]);
      await act(async () => resolveOld(page([scenario.row("obsolete")])));
      expect(options()).toEqual(["current"]);
      fireEvent.change(input, { target: { value: "" } });
      expect(options()).toEqual([]);
    },
  );

  it("does not replace the current result with an obsolete filter response", async () => {
    let resolveOld: (value: Page<BingoSummary>) => void = () => undefined;
    mocks.query = "search=obsolete";
    mocks.explore.mockReturnValueOnce(
      new Promise((done) => {
        resolveOld = done;
      }),
    );
    mocks.explore.mockResolvedValueOnce(
      page([{ id: "current", title: "Current results" } as BingoSummary]),
    );
    const view = render(<ExplorePage />);
    mocks.query = "search=current";
    view.rerender(<ExplorePage />);
    await act(async () => Promise.resolve());
    expect(screen.getByText("Current results")).toBeVisible();
    await act(async () =>
      resolveOld(page([{ id: "obsolete", title: "Obsolete results" } as BingoSummary])),
    );
    expect(screen.getByText("Current results")).toBeVisible();
    expect(screen.queryByText("Obsolete results")).not.toBeInTheDocument();
  });
});
