import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BingoBoardView, revisionCellKey } from "@/components/bingo/bingo-board-view";
import type { BingoRevision, RevisionCell } from "@/lib/api/types";

const cell: RevisionCell = {
  id: "cell-public-id",
  row: 0,
  column: 0,
  text: "Went somewhere new",
  text_color: "#000000",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  background_color: "#ffffff",
  background_opacity: 1,
  image: null,
  image_opacity: 1,
  border_color: "#000000",
  border_width: 1,
  border_style: "solid",
};

const revision: BingoRevision = {
  id: "revision-id",
  number: 1,
  title: "Year in review",
  description: "",
  size: 3,
  board_background: null,
  cover: null,
  completion_style: "checkmark",
  cells: [cell],
  published_at: "2026-01-01T00:00:00Z",
};

describe("BingoBoardView", () => {
  it("calls the toggle handler with the stable cell identifier", () => {
    const onToggle = vi.fn();
    render(
      <BingoBoardView
        revision={revision}
        selected={new Set()}
        completionStyle="checkmark"
        readOnly={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /went somewhere new/i }));
    expect(onToggle).toHaveBeenCalledWith(revisionCellKey(cell));
  });

  it("renders immutable shared results as disabled controls", () => {
    render(
      <BingoBoardView
        revision={revision}
        selected={new Set([cell.id!])}
        completionStyle="checkmark"
        readOnly
      />,
    );
    expect(screen.getByRole("gridcell", { name: /selected/i })).toBeDisabled();
    expect(screen.getByText("✓")).toBeInTheDocument();
  });

  it("uses roving focus and arrow-key navigation for playable grids", () => {
    const secondCell: RevisionCell = {
      ...cell,
      id: "second-cell-public-id",
      column: 1,
      text: "Learned something",
    };
    render(
      <BingoBoardView
        revision={{ ...revision, cells: [cell, secondCell] }}
        selected={new Set()}
        completionStyle="checkmark"
        readOnly={false}
      />,
    );

    const first = screen.getByRole("button", { name: /went somewhere new/i });
    const second = screen.getByRole("button", { name: /learned something/i });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("tabindex", "0");
    expect(first).toHaveAttribute("tabindex", "-1");
  });
});
