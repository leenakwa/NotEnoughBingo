"use client";

import type { Dispatch } from "react";
import { useState } from "react";

import { ImageIcon } from "@/components/ui/icons";
import type { EditorAction, EditorState } from "@/features/editor/editor-state";
import type { BingoExportFormat } from "@/lib/api/types";

export function BingoDetails({
  state,
  dispatch,
  onBack,
  onCoverSelected,
  coverUploadPending,
  uploadPending,
  pendingAction,
  message,
  error,
  onSave,
  onPublish,
  onExport,
  exportAvailable,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onBack: () => void;
  onCoverSelected: (file: File) => void;
  coverUploadPending: boolean;
  uploadPending: boolean;
  pendingAction: string | null;
  message: string;
  error: string;
  onSave: () => void;
  onPublish: () => void;
  onExport: (format: BingoExportFormat) => void;
  exportAvailable: boolean;
}) {
  const [tagInput, setTagInput] = useState("");
  const coverUrl = state.cover.previewUrl ?? state.cover.asset?.url;

  function addTag() {
    dispatch({ type: "add-tag", value: tagInput });
    setTagInput("");
  }

  return (
    <section className="details-panel" aria-labelledby="details-title">
      <button type="button" className="text-button back-button" onClick={onBack}>
        ← Back to bingo
      </button>
      <p className="eyebrow">Board details</p>
      <h1 id="details-title">Almost there</h1>
      <p>Give your bingo a clear identity and decide who can open it.</p>

      <label className="field">
        <span>Title</span>
        <input
          type="text"
          maxLength={70}
          required
          value={state.title}
          onChange={(event) => dispatch({ type: "set-title", value: event.target.value })}
          aria-invalid={Boolean(error && !state.title.trim())}
        />
      </label>
      <label className="field">
        <span>
          Description <small>optional</small>
        </span>
        <textarea
          rows={4}
          maxLength={500}
          value={state.description}
          onChange={(event) => dispatch({ type: "set-description", value: event.target.value })}
        />
      </label>

      <div className="field">
        <span>
          Tags <small>{state.tags.length}/15</small>
        </span>
        <div className="tag-input-row">
          <input
            aria-label="Tag"
            value={tagInput}
            maxLength={40}
            placeholder="Search or add a tag"
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
          />
          <button
            type="button"
            className="button button--secondary"
            disabled={!tagInput.trim() || state.tags.length >= 15}
            onClick={addTag}
          >
            Add
          </button>
        </div>
        {state.tags.length ? (
          <div className="tag-chips" role="group" aria-label="Selected tags">
            {state.tags.map((tag) => (
              <span key={tag}>
                {tag}
                <button
                  type="button"
                  aria-label={`Remove ${tag}`}
                  onClick={() => dispatch({ type: "remove-tag", value: tag })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="details-columns">
        <label className="field">
          <span>Visibility</span>
          <select
            value={state.visibility}
            onChange={(event) =>
              dispatch({
                type: "set-visibility",
                value: event.target.value as EditorState["visibility"],
              })
            }
          >
            <option value="public">Public — listed everywhere</option>
            <option value="unlisted">Unlisted — direct link only</option>
            <option value="private">Private — only you</option>
          </select>
        </label>
        <label className="field">
          <span>Cell completion style</span>
          <select
            value={state.completionStyle}
            onChange={(event) =>
              dispatch({
                type: "set-completion-style",
                value: event.target.value as EditorState["completionStyle"],
              })
            }
          >
            <option value="checkmark">Checkmark</option>
            <option value="crossout">Cross out</option>
            <option value="highlight">Highlight</option>
          </select>
        </label>
      </div>

      <div className="field">
        <span>
          Cover image <small>optional</small>
        </span>
        <div className="cover-control">
          {coverUrl ? (
            // The preview is either a local object URL or an API-owned asset.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="Selected bingo cover preview" />
          ) : (
            <div className="cover-empty">
              <ImageIcon />
              <span>No cover selected</span>
            </div>
          )}
          <label className="button button--secondary upload-button">
            <ImageIcon />
            {coverUploadPending ? "Uploading…" : "Choose file"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              hidden
              disabled={uploadPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onCoverSelected(file);
                event.target.value = "";
              }}
            />
          </label>
          {coverUrl ? (
            <button
              className="text-button"
              type="button"
              disabled={uploadPending}
              onClick={() =>
                dispatch({
                  type: "set-cover",
                  media: { asset: null, previewUrl: null },
                })
              }
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="details-actions">
        <button
          type="button"
          className="button button--primary"
          disabled={Boolean(pendingAction) || uploadPending}
          onClick={onPublish}
        >
          {pendingAction === "publish" ? "Publishing…" : "Publish bingo"}
        </button>
        <button
          type="button"
          className="button button--secondary"
          disabled={Boolean(pendingAction) || uploadPending}
          onClick={onSave}
        >
          {pendingAction === "save" ? "Saving…" : "Save draft"}
        </button>
        {exportAvailable ? (
          <details className="download-control">
            <summary className="button button--secondary">Download</summary>
            <div>
              <button
                type="button"
                disabled={Boolean(pendingAction) || uploadPending}
                onClick={() => onExport("png")}
              >
                PNG
              </button>
              <button
                type="button"
                disabled={Boolean(pendingAction) || uploadPending}
                onClick={() => onExport("pdf")}
              >
                PDF
              </button>
            </div>
          </details>
        ) : (
          <button
            type="button"
            className="button button--secondary"
            disabled
            title="Publish the bingo before exporting it"
          >
            Download after publishing
          </button>
        )}
      </div>
      <p
        className={error ? "form-message form-message--error" : "form-message"}
        role={error ? "alert" : "status"}
        aria-live="polite"
      >
        {error || message}
      </p>
    </section>
  );
}
