import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExplorePage } from "@/components/explore/explore-page";
import { trackInteraction } from "@/lib/analytics";
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
  it.each(["success", "error"])(
    "ignores identical pending submits in one event batch and allows a repeat after %s",
    async (outcome) => {
      mocks.query = "search=travel";
      let resolve: (value: Page<BingoSummary>) => void = () => undefined;
      let reject: (reason: Error) => void = () => undefined;
      mocks.explore.mockReturnValueOnce(
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
      );
      render(<ExplorePage initialResult={page([])} />);
      const form = screen.getByRole("button", { name: "Search" }).closest("form")!;

      act(() => {
        fireEvent.submit(form);
        fireEvent.submit(form);
      });
      expect(trackInteraction).toHaveBeenCalledTimes(1);
      expect(mocks.replace).toHaveBeenCalledTimes(1);
      expect(mocks.explore).toHaveBeenCalledTimes(1);
      fireEvent.submit(form);
      expect(trackInteraction).toHaveBeenCalledTimes(1);

      await act(async () => {
        if (outcome === "success") resolve(page([]));
        else reject(new Error("offline"));
      });
      fireEvent.submit(form);
      expect(trackInteraction).toHaveBeenCalledTimes(2);
      expect(mocks.replace).toHaveBeenCalledTimes(2);
      expect(mocks.explore).toHaveBeenCalledTimes(2);
      await act(async () => Promise.resolve());
    },
  );

  it("keeps a new search pending until its URL has applied and its own response settles", async () => {
    mocks.query = "search=travel";
    let resolveNew: (value: Page<BingoSummary>) => void = () => undefined;
    mocks.explore.mockResolvedValueOnce(page([]));
    mocks.explore.mockReturnValueOnce(
      new Promise((done) => {
        resolveNew = done;
      }),
    );
    const view = render(<ExplorePage initialResult={page([])} />);
    const form = screen.getByRole("button", { name: "Search" }).closest("form")!;
    fireEvent.change(screen.getByLabelText("Search by title"), { target: { value: "holiday" } });
    fireEvent.submit(form);
    await act(async () => Promise.resolve());
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(1);
    expect(mocks.explore).toHaveBeenCalledTimes(1);
    mocks.query = "search=holiday";
    view.rerender(<ExplorePage />);
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(1);
    expect(mocks.explore).toHaveBeenCalledTimes(2);
    await act(async () => resolveNew(page([])));
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(2);
    expect(mocks.explore).toHaveBeenCalledTimes(3);
    await act(async () => Promise.resolve());
  });

  it("allows changed filters while pending and does not unlock them after an obsolete response", async () => {
    mocks.query = "search=travel";
    let resolveOld: (value: Page<BingoSummary>) => void = () => undefined;
    let resolveNew: (value: Page<BingoSummary>) => void = () => undefined;
    mocks.explore.mockReturnValueOnce(
      new Promise((done) => {
        resolveOld = done;
      }),
    );
    mocks.explore.mockReturnValueOnce(
      new Promise((done) => {
        resolveNew = done;
      }),
    );
    mocks.replace.mockImplementation((url: string) => {
      mocks.query = url.split("?")[1] ?? "";
    });
    render(<ExplorePage initialResult={page([])} />);
    const form = screen.getByRole("button", { name: "Search" }).closest("form")!;

    fireEvent.submit(form);
    fireEvent.change(screen.getByLabelText("Search by title"), { target: { value: "holiday" } });
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(2);
    expect(mocks.explore).toHaveBeenCalledTimes(2);
    expect(mocks.explore.mock.calls[0]?.[1]?.aborted).toBe(true);
    await act(async () => resolveOld(page([])));
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(2);
    expect(mocks.explore).toHaveBeenCalledTimes(2);
    await act(async () => resolveNew(page([])));
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(3);
    expect(mocks.explore).toHaveBeenCalledTimes(3);
    await act(async () => Promise.resolve());
  });

  it("does not unlock a newer submit when an earlier URL transition applies first", async () => {
    mocks.query = "search=travel";
    let resolveCurrent: (value: Page<BingoSummary>) => void = () => undefined;
    mocks.explore.mockResolvedValueOnce(page([]));
    mocks.explore.mockResolvedValueOnce(page([]));
    mocks.explore.mockReturnValueOnce(
      new Promise((done) => {
        resolveCurrent = done;
      }),
    );
    const view = render(<ExplorePage initialResult={page([])} />);
    const form = screen.getByRole("button", { name: "Search" }).closest("form")!;
    const input = screen.getByLabelText("Search by title");
    act(() => {
      fireEvent.change(input, { target: { value: "holiday" } });
      fireEvent.submit(form);
      fireEvent.change(input, { target: { value: "current" } });
      fireEvent.submit(form);
    });
    await act(async () => Promise.resolve());
    mocks.query = "search=holiday";
    view.rerender(<ExplorePage />);
    await act(async () => Promise.resolve());
    fireEvent.change(input, { target: { value: "current" } });
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(2);
    mocks.query = "search=current";
    view.rerender(<ExplorePage />);
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(2);
    await act(async () => resolveCurrent(page([])));
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(3);
    await act(async () => Promise.resolve());
  });

  it("allows resubmitting an aborted search after browser Back restores its source URL", async () => {
    mocks.query = "search=travel";
    mocks.explore.mockReturnValueOnce(new Promise(() => undefined));
    mocks.replace.mockImplementation((url: string) => {
      mocks.query = url.split("?")[1] ?? "";
    });
    const view = render(<ExplorePage initialResult={page([])} />);
    const form = screen.getByRole("button", { name: "Search" }).closest("form")!;
    const input = screen.getByLabelText("Search by title");
    fireEvent.change(input, { target: { value: "holiday" } });
    fireEvent.submit(form);
    expect(mocks.explore).toHaveBeenCalledTimes(1);
    expect(mocks.explore.mock.calls[0]?.[0]?.search).toBe("holiday");

    mocks.query = "search=travel";
    view.rerender(<ExplorePage />);
    expect(mocks.explore.mock.calls[0]?.[1]?.aborted).toBe(true);
    await act(async () => Promise.resolve());
    fireEvent.change(input, { target: { value: "holiday" } });
    fireEvent.submit(form);
    expect(trackInteraction).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenCalledTimes(2);
    expect(mocks.explore).toHaveBeenCalledTimes(3);
    await act(async () => Promise.resolve());
  });

  it("groups active filters and preserves the remaining filters when removing a tag", () => {
    mocks.query = "search=travel&author=sample&tags=holiday,year&ordering=newest&page=3";
    render(<ExplorePage initialResult={page([])} />);

    const filters = within(screen.getByRole("group", { name: "Active filters" }));
    expect(filters.getByRole("button", { name: "Remove title filter: travel" })).toBeEnabled();
    expect(filters.getByRole("button", { name: "Remove author filter: sample" })).toBeEnabled();
    expect(filters.getByRole("button", { name: "Remove tag filter: year" })).toBeEnabled();
    expect(filters.getByRole("button", { name: "Remove newest-first sorting" })).toBeEnabled();

    fireEvent.click(filters.getByRole("button", { name: "Remove tag filter: holiday" }));

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      "/explore?search=travel&author=sample&tags=year&ordering=newest",
      { scroll: false },
    );
    expect(screen.getByLabelText("Tags", { exact: true })).toHaveValue("year");
  });

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
