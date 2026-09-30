import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SharedResultView } from "@/features/play/shared-result-view";
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
});
