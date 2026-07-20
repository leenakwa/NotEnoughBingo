"use client";

import type { CSSProperties, Dispatch, KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";

import {
  activeCells,
  cellKey,
  type EditorAction,
  type EditorState,
} from "@/features/editor/editor-state";

interface BoardStyle extends CSSProperties {
  "--board-size": number;
}

function mediaUrl(previewUrl: string | null, assetUrl?: string | null) {
  return previewUrl ?? assetUrl ?? null;
}

export function EditorBoard({
  state,
  dispatch,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}) {
  const dragAnchor = useRef<{ row: number; column: number } | null>(null);
  const dragged = useRef(false);
  const [focusedKey, setFocusedKey] = useState(state.primaryKey ?? cellKey(0, 0));
  const boardBackground = mediaUrl(
    state.boardBackground.previewUrl,
    state.boardBackground.asset?.url,
  );
  const style: BoardStyle = {
    "--board-size": state.size,
    backgroundImage: boardBackground ? `url("${boardBackground}")` : undefined,
  };

  function pointFromPointer(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      column: Math.max(
        0,
        Math.min(
          state.size - 1,
          Math.floor((event.clientX - rect.left) / (rect.width / state.size)),
        ),
      ),
      row: Math.max(
        0,
        Math.min(
          state.size - 1,
          Math.floor((event.clientY - rect.top) / (rect.height / state.size)),
        ),
      ),
    };
  }

  function startSelection(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    const point = pointFromPointer(event);
    dragAnchor.current = point;
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch({ type: "select-rectangle", anchor: point, focus: point });
  }

  function moveSelection(event: PointerEvent<HTMLElement>) {
    const anchor = dragAnchor.current;
    if (!anchor) return;
    const focus = pointFromPointer(event);
    dragged.current ||= focus.row !== anchor.row || focus.column !== anchor.column;
    dispatch({ type: "select-rectangle", anchor, focus });
  }

  function finishSelection(event: PointerEvent<HTMLElement>) {
    dragAnchor.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleCellClick(row: number, column: number, fromKeyboard: boolean) {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const point = { row, column };
    const key = cellKey(row, column);
    if (!fromKeyboard || !state.selectedKeys.includes(key)) {
      dispatch({ type: "select-rectangle", anchor: point, focus: point });
    }
    if (fromKeyboard) {
      window.setTimeout(() => {
        document.querySelector<HTMLTextAreaElement>(".cell-inspector textarea")?.focus();
      }, 0);
    }
  }

  function handleCellKeyDown(event: KeyboardEvent<HTMLButtonElement>, row: number, column: number) {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(state.size - 1, row + move[0]));
    const nextColumn = Math.max(0, Math.min(state.size - 1, column + move[1]));
    const next = event.currentTarget
      .closest(".editor-board")
      ?.querySelector<HTMLButtonElement>(`[data-cell-key="${cellKey(nextRow, nextColumn)}"]`);
    if (!next) return;
    setFocusedKey(next.dataset.cellKey ?? cellKey(nextRow, nextColumn));
    next.focus();
    if (event.shiftKey) {
      const [anchorRow, anchorColumn] = (state.primaryKey ?? cellKey(row, column))
        .split(":")
        .map(Number);
      dispatch({
        type: "select-rectangle",
        anchor: {
          row: anchorRow !== undefined && Number.isFinite(anchorRow) ? anchorRow : row,
          column:
            anchorColumn !== undefined && Number.isFinite(anchorColumn) ? anchorColumn : column,
        },
        focus: { row: nextRow, column: nextColumn },
      });
    }
  }

  const focusKey =
    Number(focusedKey.split(":")[0]) < state.size && Number(focusedKey.split(":")[1]) < state.size
      ? focusedKey
      : cellKey(0, 0);

  return (
    <>
      <p id="editor-board-help" className="sr-only">
        Use the arrow keys to move between cells. Press Space or Enter to edit one cell, or hold
        Shift while using an arrow key to select a rectangular range.
      </p>
      <section
        className="editor-board"
        style={style}
        role="grid"
        aria-label={`${state.size} by ${state.size} bingo board`}
        aria-describedby="editor-board-help"
        aria-multiselectable="true"
        onPointerDown={startSelection}
        onPointerMove={moveSelection}
        onPointerUp={finishSelection}
        onPointerCancel={finishSelection}
      >
        {activeCells(state).map((cell) => {
          const key = cellKey(cell.row, cell.column);
          const selected = state.selectedKeys.includes(key);
          const image = mediaUrl(cell.image.previewUrl, cell.image.asset?.url);
          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              className={`editor-cell${selected ? " is-selected" : ""}${state.primaryKey === key ? " is-primary" : ""}`}
              data-cell-key={key}
              aria-selected={selected}
              aria-label={`Row ${cell.row + 1}, column ${cell.column + 1}: ${cell.text || "empty"}`}
              tabIndex={key === focusKey ? 0 : -1}
              style={{
                color: cell.textColor,
                borderColor: cell.borderColor,
                borderWidth: `${cell.borderWidth}px`,
                borderStyle: cell.borderStyle,
              }}
              onFocus={() => setFocusedKey(key)}
              onClick={(event) => handleCellClick(cell.row, cell.column, event.detail === 0)}
              onKeyDown={(event) => handleCellKeyDown(event, cell.row, cell.column)}
            >
              <span
                className="editor-cell__background"
                style={{
                  backgroundColor: cell.backgroundColor,
                  opacity: cell.backgroundOpacity,
                }}
                aria-hidden="true"
              />
              {image ? (
                <span
                  className="editor-cell__image"
                  style={{
                    backgroundImage: `url("${image}")`,
                    opacity: cell.imageOpacity,
                  }}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className="editor-cell__text"
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
                {cell.text || (
                  <span className="cell-placeholder" aria-hidden="true">
                    {cell.row * state.size + cell.column + 1}
                  </span>
                )}
              </span>
              <span className="selection-frame" aria-hidden="true" />
            </button>
          );
        })}
      </section>
    </>
  );
}
