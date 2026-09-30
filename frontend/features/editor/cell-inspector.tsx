"use client";

import type { Dispatch } from "react";
import { useState } from "react";

import { ImageIcon } from "@/components/ui/icons";
import { UploadStatus } from "@/components/ui/upload-status";
import {
  selectedPrimaryCell,
  type EditorAction,
  type EditorState,
  type TextFormat,
} from "@/features/editor/editor-state";
import type { UploadPhase } from "@/lib/uploads";

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
  uploadPhase,
  onCancelUpload,
  uploadFeedback,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onImageSelected: (file: File) => void;
  uploadPending: boolean;
  uploadPhase?: UploadPhase;
  onCancelUpload: () => void;
  uploadFeedback: { text: string; error: boolean } | null;
}) {
  const [bulkTextSelection, setBulkTextSelection] = useState<string | null>(null);
  const cell = selectedPrimaryCell(state);
  if (!cell) return null;
  const selectionToken = state.selectedKeys.join("|");
  const multipleSelected = state.selectedKeys.length > 1;
  const bulkTextEnabled = multipleSelected && bulkTextSelection === selectionToken;

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

      {multipleSelected && !bulkTextEnabled ? (
        <div className="bulk-text-safety">
          <p>Text is kept separate for each selected cell.</p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setBulkTextSelection(selectionToken)}
          >
            Set same text for {state.selectedKeys.length} cells
          </button>
        </div>
      ) : (
        <label className="field">
          <span id={bulkTextEnabled ? "bulk-text-label" : undefined}>
            {bulkTextEnabled ? `Shared text for ${state.selectedKeys.length} cells` : "Text"}
          </span>
          <textarea
            rows={4}
            maxLength={100}
            value={cell.text}
            placeholder="Write something…"
            aria-labelledby={bulkTextEnabled ? "bulk-text-label" : undefined}
            aria-describedby={bulkTextEnabled ? "bulk-text-description" : undefined}
            onChange={(event) =>
              dispatch({
                type: "patch-selected",
                patch: { text: event.target.value },
              })
            }
          />
          {bulkTextEnabled ? (
            <small id="bulk-text-description">This replaces the text in every selected cell.</small>
          ) : null}
        </label>
      )}

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
          className="sr-only"
          disabled={uploadPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImageSelected(file);
            event.target.value = "";
          }}
        />
      </label>
      {uploadPhase ? <UploadStatus phase={uploadPhase} onCancel={onCancelUpload} /> : null}
      {uploadFeedback ? (
        <p
          className={uploadFeedback.error ? "form-message form-message--error" : "form-message"}
          role={uploadFeedback.error ? "alert" : "status"}
        >
          {uploadFeedback.text}
        </p>
      ) : null}
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
      {cell.image.asset || cell.image.previewUrl ? (
        state.selectedKeys.length === 1 ? (
          <label className="field">
            <span>Image description</span>
            <input
              type="text"
              maxLength={160}
              value={cell.imageAlt}
              placeholder="Describe what this image shows"
              aria-invalid={!cell.text.trim() && !cell.imageAlt.trim()}
              onChange={(event) =>
                dispatch({ type: "patch-selected", patch: { imageAlt: event.target.value } })
              }
            />
            <small>Required for image-only cells so everyone can understand them.</small>
          </label>
        ) : (
          <p className="field-hint">Select one cell at a time to describe its image.</p>
        )
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
