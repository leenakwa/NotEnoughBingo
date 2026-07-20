"use client";

import type { Dispatch } from "react";

import { ImageIcon } from "@/components/ui/icons";
import {
  selectedPrimaryCell,
  type EditorAction,
  type EditorState,
  type TextFormat,
} from "@/features/editor/editor-state";

const formats: { value: TextFormat; label: string; glyph: string }[] = [
  { value: "bold", label: "Bold", glyph: "B" },
  { value: "italic", label: "Italic", glyph: "I" },
  { value: "strikethrough", label: "Strikethrough", glyph: "S" },
  { value: "underline", label: "Underline", glyph: "U" },
];

export function CellInspector({
  state,
  dispatch,
  onImageSelected,
  uploadPending,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onImageSelected: (file: File) => void;
  uploadPending: boolean;
}) {
  const cell = selectedPrimaryCell(state);
  if (!cell) return null;

  return (
    <aside className="cell-inspector" aria-labelledby="inspector-title">
      <div className="inspector-heading">
        <h2 id="inspector-title">
          {state.selectedKeys.length > 1
            ? `${state.selectedKeys.length} cells selected`
            : "Cell editor"}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close cell editor"
          onClick={() => {
            const returnKey = state.primaryKey;
            dispatch({ type: "clear-selection" });
            window.setTimeout(() => {
              if (returnKey) {
                document
                  .querySelector<HTMLButtonElement>(`.editor-board [data-cell-key="${returnKey}"]`)
                  ?.focus();
              }
            }, 0);
          }}
        >
          ×
        </button>
      </div>

      <label className="field">
        <span>Text</span>
        <textarea
          rows={4}
          maxLength={100}
          value={cell.text}
          placeholder="Write something…"
          onChange={(event) =>
            dispatch({
              type: "patch-selected",
              patch: { text: event.target.value },
            })
          }
        />
      </label>

      <div className="format-row" role="group" aria-label="Text formatting">
        {formats.map((format) => (
          <button
            key={format.value}
            type="button"
            className="format-button"
            aria-label={format.label}
            aria-pressed={cell[format.value]}
            onClick={() => dispatch({ type: "toggle-format", format: format.value })}
          >
            {format.glyph}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Text colour</span>
        <input
          className="color-input"
          type="color"
          value={cell.textColor}
          onChange={(event) =>
            dispatch({
              type: "patch-selected",
              patch: { textColor: event.target.value },
            })
          }
        />
      </label>
      <label className="field">
        <span>Cell background</span>
        <input
          className="color-input"
          type="color"
          value={cell.backgroundColor}
          onChange={(event) =>
            dispatch({
              type: "patch-selected",
              patch: { backgroundColor: event.target.value },
            })
          }
        />
      </label>
      <label className="field">
        <span className="range-heading">
          Background opacity <output>{Math.round(cell.backgroundOpacity * 100)}%</output>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(cell.backgroundOpacity * 100)}
          onChange={(event) =>
            dispatch({
              type: "patch-selected",
              patch: { backgroundOpacity: Number(event.target.value) / 100 },
            })
          }
        />
      </label>

      <label className="button button--secondary upload-button">
        <ImageIcon />
        {uploadPending ? "Uploading…" : "Add image to cell"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          hidden
          disabled={uploadPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImageSelected(file);
            event.target.value = "";
          }}
        />
      </label>
      {cell.image.asset || cell.image.previewUrl ? (
        <button
          type="button"
          className="text-button"
          disabled={uploadPending}
          onClick={() =>
            dispatch({
              type: "set-selected-image",
              media: { asset: null, previewUrl: null },
            })
          }
        >
          Remove cell image
        </button>
      ) : null}
      <label className="field">
        <span className="range-heading">
          Image opacity <output>{Math.round(cell.imageOpacity * 100)}%</output>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(cell.imageOpacity * 100)}
          onChange={(event) =>
            dispatch({
              type: "patch-selected",
              patch: { imageOpacity: Number(event.target.value) / 100 },
            })
          }
        />
      </label>

      <hr />
      <h3>Borders</h3>
      <label className="field">
        <span>Border colour</span>
        <input
          className="color-input"
          type="color"
          value={cell.borderColor}
          onChange={(event) =>
            dispatch({
              type: "patch-selected",
              patch: { borderColor: event.target.value },
            })
          }
        />
      </label>
      <label className="field">
        <span className="range-heading">
          Border width <output>{cell.borderWidth}px</output>
        </span>
        <input
          type="range"
          min="0"
          max="12"
          value={cell.borderWidth}
          onChange={(event) =>
            dispatch({
              type: "patch-selected",
              patch: { borderWidth: Number(event.target.value) },
            })
          }
        />
      </label>
      <label className="field">
        <span>Border style</span>
        <select
          value={cell.borderStyle}
          onChange={(event) =>
            dispatch({
              type: "patch-selected",
              patch: {
                borderStyle: event.target.value as typeof cell.borderStyle,
                borderWidth:
                  event.target.value === "dotted"
                    ? Math.max(3, cell.borderWidth)
                    : cell.borderWidth,
              },
            })
          }
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
          <option value="double">Double</option>
        </select>
      </label>
    </aside>
  );
}
