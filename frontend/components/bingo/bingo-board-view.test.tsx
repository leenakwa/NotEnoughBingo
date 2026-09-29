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
  language: "en",
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
    expect(screen.getByText(cell.text, { selector: ".play-cell-detail p" })).toBeVisible();
    expect(screen.getByRole("button", { name: /went somewhere new/i })).toHaveAttribute(
      "title",
      cell.text,
    );
  });

  it("keeps shared results immutable while exposing full cell text", () => {
    const onToggle = vi.fn();
    render(
      <BingoBoardView
        revision={revision}
        selected={new Set([cell.id!])}
        completionStyle="checkmark"
        readOnly
        onToggle={onToggle}
      />,
    );
    const readOnlyCell = screen.getByRole("button", { name: /selected/i });
    expect(readOnlyCell).toBeEnabled();
    fireEvent.click(readOnlyCell);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText(cell.text, { selector: ".play-cell-detail p" })).toBeVisible();
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
    fireEvent.focus(first);
    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("tabindex", "0");
    expect(first).toHaveAttribute("tabindex", "-1");
  });

  it("provides a keyboard-focusable scroll region for large mobile boards", () => {
    render(
      <BingoBoardView
        revision={{ ...revision, size: 10 }}
        selected={new Set()}
        completionStyle="checkmark"
        readOnly={false}
      />,
    );

    expect(screen.getByRole("region", { name: "Scrollable bingo board" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("grid")).toHaveAttribute("data-board-size", "10");
    expect(screen.getByText("Scroll sideways to use this large board.")).toBeVisible();
  });
});
