"use client";

import { useId, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";

import type { BingoRevision, CompletionStyle, RevisionCell } from "@/lib/api/types";

export type PlayMarkStyle = CompletionStyle | "cross";

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
  disabled = false,
  onToggle,
}: {
  revision: BingoRevision;
  selected: Set<string>;
  completionStyle: PlayMarkStyle;
  readOnly: boolean;
  disabled?: boolean;
  onToggle?: (key: string) => void;
}) {
  const cells = [...revision.cells].sort(
    (left, right) => left.row - right.row || left.column - right.column,
  );
  const rows = cells.reduce<Array<{ index: number; cells: RevisionCell[] }>>((result, cell) => {
    const current = result.at(-1);
    if (current?.index === cell.row) {
      current.cells.push(cell);
    } else {
      result.push({ index: cell.row, cells: [cell] });
    }
    return result;
  }, []);
  const selectedCell = cells.find((cell) => selected.has(revisionCellKey(cell)));
  const defaultFocusKey = selectedCell
    ? revisionCellKey(selectedCell)
    : cells[0]
      ? revisionCellKey(cells[0])
      : "";
  const [focusedKey, setFocusedKey] = useState(defaultFocusKey);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const availableKeys = new Set(cells.map(revisionCellKey));
  const activeFocusKey = availableKeys.has(focusedKey) ? focusedKey : defaultFocusKey;
  const detailCell = cells.find((cell) => revisionCellKey(cell) === detailKey) ?? null;
  const boardHelpId = useId();
  const cellDetailId = useId();
  const backgroundUrl = revision.board_background?.thumbnail_url ?? revision.board_background?.url;
  const style: BoardStyle = {
    "--board-size": revision.size,
    backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : undefined,
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
      <p id={boardHelpId} className="sr-only">
        {readOnly
          ? "Use the arrow keys to move between cells and activate a cell to show its full text. This result is read-only."
          : "Use the arrow keys to move between cells and Space or Enter to toggle the focused cell. The full text appears below the board."}
      </p>
      {revision.size >= 8 ? (
        <p className="large-board-hint">Scroll sideways to use this large board.</p>
      ) : null}
      <div
        className="board-scroll-region"
        role={revision.size >= 8 ? "region" : undefined}
        aria-label={revision.size >= 8 ? "Scrollable bingo board" : undefined}
        tabIndex={revision.size >= 8 ? 0 : undefined}
      >
        <div
          className="play-board"
          style={style}
          role="grid"
          data-board-size={revision.size}
          aria-label={`${revision.title}, ${revision.size} by ${revision.size} bingo board`}
          aria-describedby={boardHelpId}
          aria-multiselectable={true}
          aria-readonly={readOnly}
          aria-busy={disabled}
          data-completion-style={completionStyle}
        >
          {rows.map((row) => (
            <div key={row.index} className="play-grid-row" role="row">
              {row.cells.map((cell) => {
                const key = revisionCellKey(cell);
                const isSelected = selected.has(key);
                const imageDescription = cell.image ? (cell.image_alt ?? "").trim() : "";
                const cellLabel = cell.text.trim()
                  ? `${cell.text}${imageDescription ? `. Image: ${imageDescription}` : ""}`
                  : imageDescription
                    ? `Image: ${imageDescription}`
                    : `Row ${cell.row + 1}, column ${cell.column + 1}`;
                return (
                  <div
                    key={key}
                    className="play-grid-cell"
                    role="gridcell"
                    aria-selected={isSelected}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      lang={
                        cell.text || imageDescription ? revision.language || undefined : undefined
                      }
                      className={`play-cell${isSelected ? " is-complete" : ""}`}
                      title={cell.text || imageDescription || undefined}
                      data-cell-key={key}
                      data-cell-position={`${cell.row}:${cell.column}`}
                      aria-pressed={readOnly ? undefined : isSelected}
                      aria-label={`${cellLabel}${isSelected ? ", selected" : ""}`}
                      tabIndex={key === activeFocusKey ? 0 : -1}
                      onFocus={() => {
                        setFocusedKey(key);
                        setDetailKey(key);
                      }}
                      onKeyDown={(event) => moveFocus(event, cell.row, cell.column)}
                      onClick={() => {
                        setDetailKey(key);
                        if (!readOnly) onToggle?.(key);
                      }}
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
                            backgroundImage: `url("${cell.image.thumbnail_url ?? cell.image.url}")`,
                            opacity: cell.image_opacity,
                          }}
                        />
                      ) : null}
                      <span
                        className="play-cell__text"
                        lang={revision.language || undefined}
                        dir="auto"
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
                      {isSelected && completionStyle !== "crossout" ? (
                        <span className="completion-check" aria-hidden="true">
                          {completionStyle === "cross" ? "×" : "✓"}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div
        id={cellDetailId}
        className="play-cell-detail"
        aria-live="polite"
        data-empty={!detailCell}
      >
        <span>Cell content</span>
        <p
          lang={
            detailCell?.text || detailCell?.image_alt ? revision.language || undefined : undefined
          }
          dir="auto"
        >
          {detailCell
            ? detailCell.text ||
              detailCell.image_alt ||
              `Row ${detailCell.row + 1}, column ${detailCell.column + 1}`
            : "Tap or focus a cell to read its complete text here."}
        </p>
      </div>
    </>
  );
}
