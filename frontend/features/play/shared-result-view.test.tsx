import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SharedResultView } from "@/features/play/shared-result-view";
import { api } from "@/lib/api/client";
import type { SharedResult } from "@/lib/api/types";

vi.mock("@/lib/api/client", () => ({
  api: { shares: { get: vi.fn() } },
  errorMessage: () => "Unable to load result.",
}));

const result: SharedResult = {
  id: "share-1",
  bingo_id: "bingo-1",
  owner_display_name: "Alex",
  owner: null,
  revision: {
    id: "revision-1",
    number: 1,
    title: "Movie Night Bingo",
    description: "",
    language: "en",
    size: 3,
    board_background: null,
    cover: null,
    completion_style: "checkmark",
    published_at: "2026-08-07T00:00:00Z",
    cells: Array.from({ length: 9 }, (_, index) => ({
      id: `cell-${index}`,
      row: Math.floor(index / 3),
      column: index % 3,
      text: `Cell ${index + 1}`,
      text_color: "#000000",
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      background_color: "#ffffff",
      background_opacity: 1,
      image: null,
      image_alt: "",
      image_opacity: 1,
      border_color: "#000000",
      border_width: 1,
      border_style: "solid",
    })),
  },
  selected_cells: ["cell-0", "cell-4"],
  created_at: "2026-08-07T00:00:00Z",
};

describe("SharedResultView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(api.shares.get).mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders the immutable result with obvious play and copy actions", async () => {
    render(<SharedResultView bingoId="bingo-1" shareId="share-1" initialResult={result} />);

    expect(screen.getByRole("heading", { name: "Movie Night Bingo" })).toBeInTheDocument();
    expect(screen.getByText("2 of 9 selected")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play this bingo" })).toHaveAttribute(
      "href",
      "/bingo/bingo-1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
  });

  it("uses native sharing when it is supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<SharedResultView bingoId="bingo-1" shareId="share-1" initialResult={result} />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Alex's result — Movie Night Bingo",
          url: window.location.href,
        }),
      ),
    );
    expect(await screen.findByText("Shared.")).toBeInTheDocument();
  });

  it("hides the previous result while the next shared link loads and supports retry", async () => {
    let rejectNext!: (error: Error) => void;
    vi.mocked(api.shares.get).mockReturnValueOnce(
      new Promise<SharedResult>((_resolve, reject) => {
        rejectNext = reject;
      }),
    );
    const next = {
      ...result,
      id: "share-2",
      revision: { ...result.revision, title: "Next shared result" },
    };
    vi.mocked(api.shares.get).mockResolvedValueOnce(next);
    const view = render(
      <SharedResultView bingoId="bingo-1" shareId="share-1" initialResult={result} />,
    );
    view.rerender(<SharedResultView bingoId="bingo-1" shareId="share-2" />);
    expect(screen.queryByRole("heading", { name: "Movie Night Bingo" })).not.toBeInTheDocument();
    expect(screen.getByText("Opening shared result…")).toBeVisible();
    await act(async () => rejectNext(new Error("Unavailable")));
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load result.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Next shared result" })).toBeVisible();
  });

  it("does not replace the current share with a late previous-link response", async () => {
    let resolveOld!: (value: SharedResult) => void;
    vi.mocked(api.shares.get).mockReturnValueOnce(
      new Promise<SharedResult>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const next = {
      ...result,
      id: "share-2",
      revision: { ...result.revision, title: "Next shared result" },
    };
    vi.mocked(api.shares.get).mockResolvedValueOnce(next);
    const view = render(<SharedResultView bingoId="bingo-1" shareId="share-1" />);
    view.rerender(<SharedResultView bingoId="bingo-1" shareId="share-2" />);
    await screen.findByRole("heading", { name: "Next shared result" });
    await act(async () => resolveOld(result));
    expect(screen.getByRole("heading", { name: "Next shared result" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Movie Night Bingo" })).not.toBeInTheDocument();
  });
});
