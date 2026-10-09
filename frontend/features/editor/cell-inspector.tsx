"use client";

import type { Dispatch } from "react";
import { useEffect, useRef, useState } from "react";

import { ImageIcon } from "@/components/ui/icons";
import { UploadStatus } from "@/components/ui/upload-status";
import {
  selectedPrimaryCell,
  type EditorAction,
  type EditorState,
  type TextFormat,
} from "@/features/editor/editor-state";
import type { UploadPhase, UploadProgress } from "@/lib/uploads";

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
  uploadProgress,
  onCancelUpload,
  uploadFeedback,
  imageDescriptionValidationKey = null,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onImageSelected: (file: File) => void;
  uploadPending: boolean;
  uploadPhase?: UploadPhase;
  uploadProgress?: UploadProgress | null;
  onCancelUpload: () => void;
  uploadFeedback: { text: string; error: boolean } | null;
  imageDescriptionValidationKey?: string | null;
}) {
  const [bulkTextSelection, setBulkTextSelection] = useState<string | null>(null);
  const imageDescriptionInputRef = useRef<HTMLInputElement>(null);
  const focusedValidationKey = useRef<string | null>(null);
  const cell = selectedPrimaryCell(state);
  const selectionToken = state.selectedKeys.join("|");
  const multipleSelected = state.selectedKeys.length > 1;
  const bulkTextEnabled = multipleSelected && bulkTextSelection === selectionToken;
  const needsImageDescription =
    Boolean(cell?.image.asset || cell?.image.previewUrl) && !cell?.text.trim();
  const imageDescriptionInvalid =
    imageDescriptionValidationKey !== null &&
    imageDescriptionValidationKey === state.primaryKey &&
    !multipleSelected &&
    needsImageDescription &&
    !cell?.imageAlt.trim();

  useEffect(() => {
    if (imageDescriptionValidationKey === null) focusedValidationKey.current = null;
    else if (
      imageDescriptionInvalid &&
      focusedValidationKey.current !== imageDescriptionValidationKey
    ) {
      imageDescriptionInputRef.current?.focus();
      focusedValidationKey.current = imageDescriptionValidationKey;
    }
  }, [imageDescriptionInvalid, imageDescriptionValidationKey]);

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
          <span id={bulkTextEnabled ? "bulk-text-label" : "cell-text-label"}>
            {bulkTextEnabled ? `Shared text for ${state.selectedKeys.length} cells` : "Text"}
          </span>
          <textarea
            rows={4}
            maxLength={100}
            value={cell.text}
            placeholder="Write something…"
            aria-labelledby={bulkTextEnabled ? "bulk-text-label" : "cell-text-label"}
            aria-describedby={
              bulkTextEnabled ? "cell-text-help bulk-text-description" : "cell-text-help"
            }
            onChange={(event) =>
              dispatch({
                type: "patch-selected",
                patch: { text: event.target.value },
              })
            }
          />
          <small id="cell-text-help">Up to 100 characters.</small>
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
          aria-label="Background opacity"
          aria-valuetext={`${Math.round(cell.backgroundOpacity * 100)} percent`}
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
      {uploadPhase ? (
        <UploadStatus phase={uploadPhase} progress={uploadProgress} onCancel={onCancelUpload} />
      ) : null}
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
            <span id="cell-image-description-label">Image description</span>
            <input
              ref={imageDescriptionInputRef}
              type="text"
              aria-labelledby="cell-image-description-label"
              maxLength={160}
              value={cell.imageAlt}
              placeholder="Describe what this image shows"
              aria-required={needsImageDescription}
              aria-invalid={imageDescriptionInvalid}
              aria-describedby={
                imageDescriptionInvalid
                  ? "cell-image-description-help cell-image-description-error"
                  : "cell-image-description-help"
              }
              onChange={(event) =>
                dispatch({ type: "patch-selected", patch: { imageAlt: event.target.value } })
              }
            />
            <small id="cell-image-description-help">
              Required for image-only cells so everyone can understand them. Up to 160 characters.
            </small>
            {imageDescriptionInvalid ? (
              <small id="cell-image-description-error" className="form-message--error" role="alert">
                Describe this image-only cell before publishing.
              </small>
            ) : null}
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
          aria-label="Image opacity"
          aria-valuetext={`${Math.round(cell.imageOpacity * 100)} percent`}
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
          aria-label="Border width"
          aria-valuetext={`${cell.borderWidth} ${cell.borderWidth === 1 ? "pixel" : "pixels"}`}
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
