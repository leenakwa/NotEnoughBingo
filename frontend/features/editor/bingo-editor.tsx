"use client";

import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";

import { ImageIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { BingoDetails } from "@/features/editor/bingo-details";
import { CellInspector } from "@/features/editor/cell-inspector";
import { EditorBoard } from "@/features/editor/editor-board";
import {
  editorPayload,
  editorReducer,
  createEditorState,
  MAX_BINGO_SIZE,
  MIN_BINGO_SIZE,
  type EditorMedia,
  type EditorStep,
} from "@/features/editor/editor-state";
import { api, errorMessage } from "@/lib/api/client";
import { makeIdempotencyKey } from "@/lib/guest-progress";
import type { BingoDraft, BingoExportFormat, ExportJob, MediaAsset } from "@/lib/api/types";
import { uploadImage } from "@/lib/uploads";

type UploadTarget = "board" | "cell" | "cover";

export function BingoEditor({ bingoId }: { bingoId?: string }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(5));
  const [step, setStep] = useState<EditorStep>("board");
  const [uploading, setUploading] = useState<UploadTarget | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const previewUrls = useRef(new Set<string>());
  const [hydrating, setHydrating] = useState(Boolean(bingoId));
  const [authState, setAuthState] = useState<"checking" | "allowed" | "guest" | "unverified">(
    "checking",
  );
  const [accountEmail, setAccountEmail] = useState("");
  const [exportAvailable, setExportAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    api.auth
      .me()
      .then((user) => {
        if (!active) return;
        setAccountEmail(user.email);
        setAuthState(user.email_verified ? "allowed" : "unverified");
      })
      .catch(() => {
        if (active) {
          setAuthState("guest");
          setHydrating(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const previewUrl of urls) URL.revokeObjectURL(previewUrl);
      urls.clear();
    };
  }, []);

  useEffect(() => {
    if (authState !== "allowed") return;
    if (!bingoId) {
      setHydrating(false);
      return;
    }
    const controller = new AbortController();
    setHydrating(true);
    setError("");
    Promise.all([
      api.bingos.getDraft(bingoId, controller.signal),
      api.bingos.get(bingoId, controller.signal),
    ])
      .then(([draft, bingo]) => {
        dispatch({ type: "hydrate", draft });
        setExportAvailable(Boolean(bingo.current_revision));
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHydrating(false);
      });
    return () => controller.abort();
  }, [authState, bingoId]);

  function mediaWithPreview(previewUrl: string): EditorMedia {
    previewUrls.current.add(previewUrl);
    return { asset: null, previewUrl };
  }

  function replaceMedia(target: UploadTarget, media: EditorMedia, cellKeys?: string[]) {
    if (target === "board") dispatch({ type: "set-board-background", media });
    if (target === "cover") dispatch({ type: "set-cover", media });
    if (target === "cell") {
      dispatch(
        cellKeys
          ? { type: "set-cell-images", keys: cellKeys, media }
          : { type: "set-selected-image", media },
      );
    }
  }

  function currentMedia(target: Exclude<UploadTarget, "cell">): EditorMedia {
    if (target === "board") return state.boardBackground;
    return state.cover;
  }

  async function handleUpload(
    target: UploadTarget,
    file: File,
    kind: Exclude<MediaAsset["kind"], "export" | "avatar">,
  ) {
    if (uploading) return;
    setError("");
    setUploading(target);
    const cellKeys = target === "cell" ? [...state.selectedKeys] : undefined;
    const previousMedia = target === "cell" ? null : currentMedia(target);
    const previewUrl = target === "cell" ? null : URL.createObjectURL(file);
    if (previewUrl) replaceMedia(target, mediaWithPreview(previewUrl));
    try {
      const asset = await uploadImage(file, kind);
      replaceMedia(target, { asset, previewUrl: null }, cellKeys);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrls.current.delete(previewUrl);
      }
    } catch (caught) {
      if (target !== "cell" && previousMedia) replaceMedia(target, previousMedia);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrls.current.delete(previewUrl);
      }
      setError(errorMessage(caught));
    } finally {
      setUploading(null);
    }
  }

  async function persistDraft(): Promise<BingoDraft> {
    const payload = editorPayload(state);
    const wasNew = !state.bingoId;
    const draft = state.bingoId
      ? await api.bingos.updateDraft(state.bingoId, payload, state.version)
      : await api.bingos.createDraft(payload, makeIdempotencyKey());
    dispatch({ type: "saved", draft });
    if (wasNew && draft.bingo_id) {
      router.replace(`/create?bingo=${draft.bingo_id}`, { scroll: false });
    }
    return draft;
  }

  async function saveDraft() {
    if (pendingAction) return;
    setPendingAction("save");
    setError("");
    setMessage("");
    try {
      const draft = await persistDraft();
      const savedAt = new Date(draft.updated_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      setMessage(`Draft saved at ${savedAt}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  }

  async function publish() {
    if (pendingAction) return;
    if (!state.title.trim()) {
      setError("Add a title before publishing.");
      return;
    }
    setPendingAction("publish");
    setError("");
    setMessage("");
    try {
      const draft = await persistDraft();
      const bingoId = draft.bingo_id ?? state.bingoId;
      if (!bingoId) throw new Error("The server did not return a bingo identifier.");
      const published = await api.bingos.publishDraft(bingoId, makeIdempotencyKey());
      router.push(`/bingo/${published.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setPendingAction(null);
    }
  }

  async function waitForExport(job: ExportJob): Promise<ExportJob> {
    let current = job;
    for (let attempt = 0; attempt < 30 && current.status !== "ready"; attempt += 1) {
      if (current.status === "failed") return current;
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      current = await api.exports.get(current.id);
    }
    return current;
  }

  async function exportBoard(format: BingoExportFormat) {
    if (pendingAction) return;
    if (!exportAvailable) {
      setError("Publish this bingo before requesting a permanent PNG or PDF export.");
      return;
    }
    setPendingAction(`export-${format}`);
    setError("");
    setMessage(`Preparing ${format.toUpperCase()} export…`);
    try {
      const draft = await persistDraft();
      const bingoId = draft.bingo_id ?? state.bingoId;
      if (!bingoId) throw new Error("Save the bingo before exporting it.");
      const job = await api.exports.create(bingoId, format, makeIdempotencyKey());
      const completed = await waitForExport(job);
      if (completed.status === "ready" && completed.download_url) {
        window.location.assign(completed.download_url);
      } else if (completed.status === "failed") {
        throw new Error(completed.error ?? "Export generation failed.");
      } else {
        setMessage("The export is still processing. It will be available from your profile.");
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction(null);
    }
  }

  if (authState === "checking" || hydrating) {
    return (
      <main id="main-content" className="create-shell">
        <LoadingState label="Loading your draft…" />
      </main>
    );
  }

  if (authState === "guest") {
    return (
      <main id="main-content" className="create-shell">
        <EmptyState
          title="Log in to create"
          description="Anyone can play public bingos. A verified account is required to save and publish one."
          action={{
            href: `/login?next=${encodeURIComponent(
              bingoId ? `/create?bingo=${bingoId}` : "/create",
            )}`,
            label: "Log in",
          }}
        />
      </main>
    );
  }

  if (authState === "unverified") {
    return (
      <main id="main-content" className="create-shell">
        <EmptyState
          title="Verify your email"
          description="Confirm your email address before creating, saving, or publishing bingos."
          action={{
            href: `/verify-email?email=${encodeURIComponent(accountEmail)}`,
            label: "Verification options",
          }}
        />
      </main>
    );
  }

  if (bingoId && error && !state.bingoId) {
    return (
      <main id="main-content" className="create-shell">
        <ErrorState message={error} />
      </main>
    );
  }

  if (step === "details") {
    return (
      <main id="main-content" className="create-shell">
        <BingoDetails
          state={state}
          dispatch={dispatch}
          onBack={() => setStep("board")}
          onCoverSelected={(file) => void handleUpload("cover", file, "cover")}
          coverUploadPending={uploading === "cover"}
          uploadPending={uploading !== null}
          pendingAction={pendingAction}
          message={message}
          error={error}
          onSave={() => void saveDraft()}
          onPublish={() => void publish()}
          onExport={(format) => void exportBoard(format)}
          exportAvailable={exportAvailable}
        />
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className={`create-shell editor-layout${state.selectedKeys.length ? " has-inspector" : ""}`}
      onPointerDown={(event) => {
        if (
          state.selectedKeys.length &&
          event.target instanceof Element &&
          !event.target.closest(
            ".editor-board, .cell-inspector, button, a, input, textarea, select, label, summary",
          )
        ) {
          dispatch({ type: "clear-selection" });
        }
      }}
    >
      <CellInspector
        state={state}
        dispatch={dispatch}
        uploadPending={uploading !== null}
        onImageSelected={(file) => void handleUpload("cell", file, "cell_image")}
      />
      <section className="editor-workspace" aria-labelledby="create-title">
        <div className="editor-toolbar">
          <div>
            <h1 id="create-title">{state.bingoId ? "Edit bingo" : "Create bingo"}</h1>
            <p>Click a cell to edit it, or drag across cells to edit several.</p>
          </div>
          <div className="size-control" role="group" aria-label="Bingo size">
            <button
              type="button"
              aria-label="Decrease bingo size"
              disabled={state.size <= MIN_BINGO_SIZE}
              onClick={() => dispatch({ type: "set-size", size: state.size - 1 })}
            >
              −
            </button>
            <output aria-live="polite">
              {state.size} × {state.size}
            </output>
            <button
              type="button"
              aria-label="Increase bingo size"
              disabled={state.size >= MAX_BINGO_SIZE}
              onClick={() => dispatch({ type: "set-size", size: state.size + 1 })}
            >
              +
            </button>
          </div>
        </div>
        <div className="board-actions">
          <label className="button button--secondary upload-button">
            <ImageIcon />
            {uploading === "board" ? "Uploading…" : "Upload background"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              hidden
              disabled={uploading !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload("board", file, "board_background");
                event.target.value = "";
              }}
            />
          </label>
          {state.boardBackground.asset || state.boardBackground.previewUrl ? (
            <button
              type="button"
              className="text-button"
              disabled={uploading === "board"}
              onClick={() =>
                dispatch({
                  type: "set-board-background",
                  media: { asset: null, previewUrl: null },
                })
              }
            >
              Remove background
            </button>
          ) : null}
        </div>

        <EditorBoard state={state} dispatch={dispatch} />

        <div className="editor-footer">
          <button
            type="button"
            className="button button--secondary"
            disabled={Boolean(pendingAction) || uploading !== null}
            onClick={() => void saveDraft()}
          >
            {pendingAction === "save" ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={uploading !== null}
            onClick={() => setStep("details")}
          >
            Finish creating →
          </button>
        </div>
        <p
          className={error ? "form-message form-message--error" : "form-message"}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
      </section>
    </main>
  );
}
