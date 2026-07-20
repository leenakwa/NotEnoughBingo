"use client";

import { useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

import type { BingoRevision, CompletionStyle, RevisionCell } from "@/lib/api/types";

interface BoardStyle extends CSSProperties {
  "--board-size": number;
}

export function revisionCellKey(cell: RevisionCell): string {
  return cell.id ?? `${cell.row}:${cell.column}`;
}

export function BingoBoardView({
  revision,
  selected,
  completionStyle,
  readOnly,
  onToggle,
}: {
  revision: BingoRevision;
  selected: Set<string>;
  completionStyle: CompletionStyle;
  readOnly: boolean;
  onToggle?: (key: string) => void;
}) {
  const cells = [...revision.cells].sort(
    (left, right) => left.row - right.row || left.column - right.column,
  );
  const selectedCell = cells.find((cell) => selected.has(revisionCellKey(cell)));
  const defaultFocusKey = selectedCell
    ? revisionCellKey(selectedCell)
    : cells[0]
      ? revisionCellKey(cells[0])
      : "";
  const [focusedKey, setFocusedKey] = useState(defaultFocusKey);
  const availableKeys = new Set(cells.map(revisionCellKey));
  const activeFocusKey = availableKeys.has(focusedKey) ? focusedKey : defaultFocusKey;
  const style: BoardStyle = {
    "--board-size": revision.size,
    backgroundImage: revision.board_background?.url
      ? `url("${revision.board_background.url}")`
      : undefined,
  };

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(revision.size - 1, row + move[0]));
    const nextColumn = Math.max(0, Math.min(revision.size - 1, column + move[1]));
    const next = event.currentTarget
      .closest(".play-board")
      ?.querySelector<HTMLButtonElement>(`[data-cell-position="${nextRow}:${nextColumn}"]`);
    if (next) {
      setFocusedKey(next.dataset.cellKey ?? "");
      next.focus();
    }
  }

  return (
    <>
      {!readOnly ? (
        <p id="play-board-help" className="sr-only">
          Use the arrow keys to move between cells and Space or Enter to toggle the focused cell.
        </p>
      ) : null}
      <section
        className="play-board"
        style={style}
        role="grid"
        aria-label={`${revision.title}, ${revision.size} by ${revision.size} bingo board`}
        aria-describedby={readOnly ? undefined : "play-board-help"}
        aria-readonly={readOnly}
        data-completion-style={completionStyle}
      >
        {cells.map((cell) => {
          const key = revisionCellKey(cell);
          const isSelected = selected.has(key);
          return (
            <div
              key={key}
              className="play-grid-cell"
              role={readOnly ? "none" : "gridcell"}
              aria-selected={readOnly ? undefined : isSelected}
            >
              <button
                type="button"
                role={readOnly ? "gridcell" : undefined}
                className={`play-cell${isSelected ? " is-complete" : ""}`}
                data-cell-key={key}
                data-cell-position={`${cell.row}:${cell.column}`}
                aria-selected={readOnly ? isSelected : undefined}
                aria-pressed={readOnly ? undefined : isSelected}
                aria-label={`${cell.text || `Row ${cell.row + 1}, column ${cell.column + 1}`}${isSelected ? ", selected" : ""}`}
                disabled={readOnly}
                tabIndex={!readOnly && key === activeFocusKey ? 0 : -1}
                onFocus={() => setFocusedKey(key)}
                onKeyDown={(event) => moveFocus(event, cell.row, cell.column)}
                onClick={() => onToggle?.(key)}
                style={{
                  color: cell.text_color,
                  borderColor: cell.border_color,
                  borderWidth: `${cell.border_width}px`,
                  borderStyle: cell.border_style,
                }}
              >
                <span
                  className="play-cell__background"
                  aria-hidden="true"
                  style={{
                    backgroundColor: cell.background_color,
                    opacity: cell.background_opacity,
                  }}
                />
                {cell.image?.url ? (
                  <span
                    className="play-cell__image"
                    aria-hidden="true"
                    style={{
                      backgroundImage: `url("${cell.image.url}")`,
                      opacity: cell.image_opacity,
                    }}
                  />
                ) : null}
                <span
                  className="play-cell__text"
                  style={{
                    fontWeight: cell.bold ? 700 : 400,
                    fontStyle: cell.italic ? "italic" : "normal",
                    textDecoration: [
                      cell.underline ? "underline" : "",
                      cell.strikethrough ? "line-through" : "",
                    ]
                      .filter(Boolean)
                      .join(" "),
                  }}
                >
                  {cell.text}
                </span>
                {isSelected && completionStyle === "checkmark" ? (
                  <span className="completion-check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}
