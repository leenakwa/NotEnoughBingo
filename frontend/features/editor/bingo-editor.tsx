"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { ImageIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { UploadStatus } from "@/components/ui/upload-status";
import { BingoDetails } from "@/features/editor/bingo-details";
import { CellInspector } from "@/features/editor/cell-inspector";
import { EditorBoard } from "@/features/editor/editor-board";
import {
  clearEditorRecovery,
  readEditorRecovery,
  writeEditorRecovery,
} from "@/features/editor/editor-recovery";
import { EditorSaveStatus, type EditorSaveStatusValue } from "@/features/editor/editor-save-status";
import {
  canRedo,
  canUndo,
  cellKey,
  editorDocumentFingerprint,
  editorDocumentSnapshot,
  editorPayload,
  editorReducer,
  createEditorState,
  editorStateFromDraft,
  editorStateWithDocument,
  MAX_BINGO_SIZE,
  meaningfulCellsRemovedByResize,
  MIN_BINGO_SIZE,
  type EditorDocumentSnapshot,
  type EditorMedia,
  type EditorStep,
} from "@/features/editor/editor-state";
import { api, ApiClientError, errorMessage } from "@/lib/api/client";
import {
  AUTH_SIGNED_IN_EVENT,
  AUTH_SESSION_ENDED_EVENT,
  AUTH_SIGNED_OUT_EVENT,
} from "@/lib/auth-events";
import { makeIdempotencyKey } from "@/lib/guest-progress";
import type { BingoDraft, BingoExportFormat, ExportJob, MediaAsset } from "@/lib/api/types";
import { uploadImage, type UploadPhase, type UploadProgress } from "@/lib/uploads";

type UploadTarget = "board" | "cell" | "cover";
type EditorPayload = ReturnType<typeof editorPayload>;

const AUTOSAVE_DELAY_MS = 800;

interface PendingDraftCreation {
  fingerprint: string;
  payload: EditorPayload;
  idempotencyKey: string;
}

function isDraftConflict(error: unknown): error is ApiClientError {
  return (
    error instanceof ApiClientError &&
    (error.status === 409 ||
      error.status === 412 ||
      error.code === "draft_version_conflict" ||
      error.code === "conflict")
  );
}

export function BingoEditorRoute() {
  const searchParams = useSearchParams();
  return <BingoEditor bingoId={searchParams.get("bingo") ?? undefined} />;
}

export function BingoEditor({ bingoId }: { bingoId?: string }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(5));
  const [step, setStep] = useState<EditorStep>("board");
  const [uploading, setUploading] = useState<UploadTarget | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("preparing");
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [cellUploadFeedback, setCellUploadFeedback] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const uploadController = useRef<AbortController | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [imageDescriptionValidationKey, setImageDescriptionValidationKey] = useState<string | null>(
    null,
  );
  const [hydrating, setHydrating] = useState(Boolean(bingoId));
  const [authState, setAuthState] = useState<
    "checking" | "allowed" | "guest" | "unverified" | "error"
  >("checking");
  const [authError, setAuthError] = useState("");
  const [authCheckVersion, setAuthCheckVersion] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [exportAvailable, setExportAvailable] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [exportCheckVersion, setExportCheckVersion] = useState(0);
  const [draftLoadVersion, setDraftLoadVersion] = useState(0);
  const [saveStatus, setSaveStatus] = useState<EditorSaveStatusValue>("pristine");
  const [saveError, setSaveError] = useState("");
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState(() =>
    editorDocumentFingerprint(createEditorState(5)),
  );
  const latestState = useRef(state);
  const latestFingerprint = useRef(editorDocumentFingerprint(state));
  const savedFingerprintRef = useRef(savedFingerprint);
  const dirtyRef = useRef(false);
  const saveStatusRef = useRef<EditorSaveStatusValue>("pristine");
  const saveLoop = useRef<Promise<BingoDraft | null> | null>(null);
  const serverDraft = useRef({ bingoId: bingoId ?? null, version: 0 });
  const pendingCreation = useRef<PendingDraftCreation | null>(null);
  const actionInFlight = useRef(false);
  const pendingPublication = useRef<{
    fingerprint: string;
    bingoId: string;
    idempotencyKey: string;
  } | null>(null);
  const failedFingerprint = useRef<string | null>(null);
  const recoveredConflictDocument = useRef<EditorDocumentSnapshot | null>(null);
  const preserveRecovery = useRef(false);
  const recoveryCheckedFor = useRef("");
  const authenticatedOwner = useRef("");
  const mutationLifetime = useRef(0);
  const previousRouteBingoId = useRef(bingoId);

  const invalidateMutations = useCallback(() => {
    mutationLifetime.current += 1;
    saveLoop.current = null;
    actionInFlight.current = false;
    uploadController.current?.abort();
    setUploadPhase("preparing");
    setUploadProgress(null);
  }, []);

  useEffect(() => {
    const previousBingoId = previousRouteBingoId.current;
    const ownCreation = previousBingoId === undefined && bingoId === serverDraft.current.bingoId;
    if (previousBingoId !== bingoId && !ownCreation) invalidateMutations();
    const openedBlank = previousBingoId !== undefined && bingoId === undefined;
    previousRouteBingoId.current = bingoId;
    if (openedBlank) {
      const fresh = createEditorState(5);
      const fingerprint = editorDocumentFingerprint(fresh);
      latestState.current = fresh;
      latestFingerprint.current = fingerprint;
      savedFingerprintRef.current = fingerprint;
      dirtyRef.current = false;
      serverDraft.current = { bingoId: null, version: 0 };
      pendingCreation.current = null;
      pendingPublication.current = null;
      failedFingerprint.current = null;
      recoveredConflictDocument.current = null;
      preserveRecovery.current = false;
      recoveryCheckedFor.current = "";
      saveStatusRef.current = "pristine";
      setSavedFingerprint(fingerprint);
      setSaveStatus("pristine");
      setSaveError("");
      setRecoveryAvailable(false);
      setPendingAction(null);
      setUploading(null);
      setError("");
      setImageDescriptionValidationKey(null);
      setMessage("");
      setStep("board");
      dispatch({ type: "new-document" });
    }
  }, [bingoId, invalidateMutations]);

  useEffect(() => () => invalidateMutations(), [invalidateMutations]);

  const currentFingerprint = editorDocumentFingerprint(state);
  const dirty = currentFingerprint !== savedFingerprint;

  const updateSaveStatus = useCallback((status: EditorSaveStatusValue) => {
    saveStatusRef.current = status;
    setSaveStatus(status);
  }, []);

  useEffect(() => {
    const refresh = () => {
      invalidateMutations();
      setAuthState("checking");
      setPendingAction(null);
      setUploading(null);
      setImageDescriptionValidationKey(null);
      failedFingerprint.current = null;
      setAuthCheckVersion((version) => version + 1);
    };
    window.addEventListener(AUTH_SIGNED_IN_EVENT, refresh);
    window.addEventListener(AUTH_SESSION_ENDED_EVENT, refresh);
    window.addEventListener(AUTH_SIGNED_OUT_EVENT, refresh);
    return () => {
      window.removeEventListener(AUTH_SIGNED_IN_EVENT, refresh);
      window.removeEventListener(AUTH_SESSION_ENDED_EVENT, refresh);
      window.removeEventListener(AUTH_SIGNED_OUT_EVENT, refresh);
    };
  }, [invalidateMutations]);

  useEffect(() => {
    latestState.current = state;
    latestFingerprint.current = currentFingerprint;
    dirtyRef.current = dirty;
  }, [currentFingerprint, dirty, state]);

  useEffect(() => {
    let active = true;
    setAuthState("checking");
    setAuthError("");
    api.auth
      .session()
      .then((user) => {
        if (!active) return;
        if (!user) {
          setAccountId("");
          setAccountEmail("");
          setAuthState("guest");
          setHydrating(false);
          return;
        }
        if (authenticatedOwner.current && authenticatedOwner.current !== user.id) {
          // Reload rechecks draft ownership and discards the previous account's in-memory editor.
          window.location.reload();
          return;
        }
        authenticatedOwner.current = user.id;
        setAccountId(user.id);
        setAccountEmail(user.email);
        setAuthState(user.email_verified ? "allowed" : "unverified");
        if (!user.email_verified) setHydrating(false);
      })
      .catch((caught) => {
        if (active) {
          setAccountId("");
          setAccountEmail("");
          setAuthError(errorMessage(caught));
          setAuthState("error");
          setHydrating(false);
        }
      });
    return () => {
      active = false;
    };
  }, [authCheckVersion]);

  useEffect(() => {
    if (authState !== "allowed" || !accountId) return;
    const recoveryScope = bingoId ?? "new";
    if (!bingoId) {
      if (recoveryCheckedFor.current !== recoveryScope) {
        recoveryCheckedFor.current = recoveryScope;
        const recovery = readEditorRecovery(accountId);
        if (
          recovery &&
          window.confirm("We found unsaved changes from an earlier visit. Restore them?")
        ) {
          dispatch({ type: "restore-document", document: recovery.document });
          updateSaveStatus("dirty");
        } else if (recovery) {
          clearEditorRecovery(accountId);
        }
      }
      setHydrating(false);
      return;
    }
    if (serverDraft.current.bingoId === bingoId && serverDraft.current.version > 0) {
      recoveryCheckedFor.current = recoveryScope;
      setHydrating(false);
      return;
    }
    const controller = new AbortController();
    setHydrating(true);
    setPendingAction(null);
    setUploading(null);
    setError("");
    setImageDescriptionValidationKey(null);
    api.bingos
      .getDraft(bingoId, controller.signal)
      .then((draft) => {
        if (controller.signal.aborted) return;
        const serverState = editorStateFromDraft(draft);
        const serverFingerprint = editorDocumentFingerprint(serverState);
        serverDraft.current = { bingoId: draft.bingo_id, version: draft.version };
        savedFingerprintRef.current = serverFingerprint;
        setSavedFingerprint(serverFingerprint);
        dispatch({ type: "hydrate", draft });
        updateSaveStatus("saved");
        recoveryCheckedFor.current = recoveryScope;
        const recovery = readEditorRecovery(accountId, bingoId);
        if (recovery && recovery.serverVersion === draft.version) {
          const recoveredState = editorStateWithDocument(serverState, recovery.document);
          if (
            editorDocumentFingerprint(recoveredState) !== serverFingerprint &&
            window.confirm("We found newer unsaved changes for this draft. Restore them?")
          ) {
            dispatch({ type: "restore-document", document: recovery.document });
            updateSaveStatus("dirty");
          } else {
            clearEditorRecovery(accountId, bingoId);
          }
        } else if (recovery) {
          clearEditorRecovery(accountId, bingoId);
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setHydrating(false);
      });
    return () => controller.abort();
  }, [accountId, authState, bingoId, draftLoadVersion, updateSaveStatus]);

  useEffect(() => {
    setExportAvailable(false);
    setExportError(false);
    setExportLoading(false);
    if (authState !== "allowed" || !accountId || !bingoId) return;
    const controller = new AbortController();
    setExportLoading(true);
    api.bingos
      .get(bingoId, controller.signal)
      .then((bingo) => {
        if (!controller.signal.aborted) setExportAvailable(Boolean(bingo.current_revision));
      })
      .catch(() => {
        if (!controller.signal.aborted) setExportError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setExportLoading(false);
      });
    return () => controller.abort();
  }, [accountId, authState, bingoId, exportCheckVersion]);

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

  async function handleUpload(
    target: UploadTarget,
    file: File,
    kind: Exclude<MediaAsset["kind"], "export" | "avatar">,
  ) {
    if (uploading) return;
    const controller = new AbortController();
    const lifetime = mutationLifetime.current;
    const isCurrent = () => lifetime === mutationLifetime.current;
    uploadController.current = controller;
    setError("");
    setMessage("");
    setCellUploadFeedback(null);
    setUploadPhase("preparing");
    setUploadProgress(null);
    setUploading(target);
    const cellKeys = target === "cell" ? [...state.selectedKeys] : undefined;
    try {
      const asset = await uploadImage(file, kind, {
        signal: controller.signal,
        onPhase: (phase) => {
          if (isCurrent() && uploadController.current === controller && !controller.signal.aborted)
            setUploadPhase(phase);
        },
        onProgress: (progress) => {
          if (isCurrent() && uploadController.current === controller && !controller.signal.aborted)
            setUploadProgress(progress);
        },
      });
      if (!isCurrent() || controller.signal.aborted) return;
      replaceMedia(target, { asset, previewUrl: null }, cellKeys);
    } catch (caught) {
      if (!isCurrent()) return;
      const cancelled = controller.signal.aborted;
      const feedback = cancelled ? "Upload cancelled." : errorMessage(caught);
      if (target === "cell") setCellUploadFeedback({ text: feedback, error: !cancelled });
      else if (cancelled) setMessage(feedback);
      else setError(feedback);
    } finally {
      if (uploadController.current === controller) uploadController.current = null;
      if (isCurrent()) {
        setUploading(null);
        setUploadProgress(null);
      }
    }
  }

  useEffect(() => () => uploadController.current?.abort(), []);

  function cancelUpload() {
    uploadController.current?.abort();
    setUploadProgress(null);
    setError("");
    if (uploading === "cell") setCellUploadFeedback({ text: "Upload cancelled.", error: false });
    else setMessage("Upload cancelled.");
  }

  const flushDraft = useCallback((): Promise<BingoDraft | null> => {
    if (saveLoop.current) return saveLoop.current;
    const lifetime = mutationLifetime.current;
    const isCurrent = () => lifetime === mutationLifetime.current;
    const operation = (async () => {
      let lastSaved: BingoDraft | null = null;
      while (latestFingerprint.current !== savedFingerprintRef.current) {
        if (!isCurrent()) return null;
        if (saveStatusRef.current === "conflict") {
          throw new Error("Resolve the draft conflict before saving again.");
        }
        updateSaveStatus("saving");
        setSaveError("");

        const requestState = latestState.current;
        let requestFingerprint = editorDocumentFingerprint(requestState);
        let payload = editorPayload(requestState);
        const wasNew = !serverDraft.current.bingoId;
        let draft: BingoDraft;
        if (wasNew) {
          const pending =
            pendingCreation.current ??
            ({
              fingerprint: requestFingerprint,
              payload,
              idempotencyKey: makeIdempotencyKey(),
            } satisfies PendingDraftCreation);
          pendingCreation.current = pending;
          requestFingerprint = pending.fingerprint;
          payload = pending.payload;
          draft = await api.bingos.createDraft(payload, pending.idempotencyKey);
          if (!isCurrent()) return null;
          pendingCreation.current = null;
        } else {
          const persistedBingoId = serverDraft.current.bingoId;
          if (!persistedBingoId) throw new Error("The draft identifier is unavailable.");
          draft = await api.bingos.updateDraft(
            persistedBingoId,
            payload,
            serverDraft.current.version,
          );
        }

        if (!isCurrent()) return null;

        const previousBingoId = serverDraft.current.bingoId;
        serverDraft.current = { bingoId: draft.bingo_id, version: draft.version };
        latestState.current = editorReducer(latestState.current, { type: "saved", draft });
        savedFingerprintRef.current = requestFingerprint;
        setSavedFingerprint(requestFingerprint);
        dispatch({ type: "saved", draft });
        failedFingerprint.current = null;
        setSaveError("");
        lastSaved = draft;

        const clean = latestFingerprint.current === requestFingerprint;
        dirtyRef.current = !clean;
        if (wasNew && draft.bingo_id) {
          clearEditorRecovery(accountId, previousBingoId);
          const draftUrl = `/create?bingo=${draft.bingo_id}`;
          window.history.replaceState(null, "", draftUrl);
        }
        if (clean) {
          preserveRecovery.current = false;
          recoveredConflictDocument.current = null;
          setRecoveryAvailable(false);
          clearEditorRecovery(accountId, previousBingoId, draft.bingo_id);
          updateSaveStatus("saved");
        } else {
          writeEditorRecovery(accountId, {
            ...latestState.current,
            bingoId: draft.bingo_id,
            version: draft.version,
          });
        }
      }
      return lastSaved;
    })().catch((caught: unknown) => {
      if (!isCurrent()) return null;
      writeEditorRecovery(accountId, latestState.current);
      if (isDraftConflict(caught)) {
        updateSaveStatus("conflict");
      } else {
        failedFingerprint.current = latestFingerprint.current;
        setSaveError(errorMessage(caught));
        updateSaveStatus("failed");
      }
      throw caught;
    });
    saveLoop.current = operation;
    void operation.then(
      () => {
        if (saveLoop.current === operation) saveLoop.current = null;
      },
      () => {
        if (saveLoop.current === operation) saveLoop.current = null;
      },
    );
    return operation;
  }, [accountId, updateSaveStatus]);

  useEffect(() => {
    if (authState !== "allowed" || !accountId || hydrating) return;
    if (bingoId && state.bingoId !== bingoId) return;
    if (!dirty) {
      failedFingerprint.current = null;
      if (!preserveRecovery.current) {
        clearEditorRecovery(accountId, state.bingoId, serverDraft.current.bingoId);
      }
      if (
        saveStatusRef.current !== "pristine" &&
        saveStatusRef.current !== "saved" &&
        !saveLoop.current
      ) {
        updateSaveStatus("saved");
      }
      return;
    }
    if (uploading) return;
    writeEditorRecovery(accountId, latestState.current);
    if (saveStatusRef.current === "conflict") return;
    if (failedFingerprint.current === currentFingerprint) return;
    if (!saveLoop.current) updateSaveStatus("dirty");
    const timeout = window.setTimeout(() => {
      void flushDraft().catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [
    accountId,
    authState,
    bingoId,
    currentFingerprint,
    dirty,
    flushDraft,
    hydrating,
    state.bingoId,
    updateSaveStatus,
    uploading,
  ]);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function protectInternalNavigation(event: MouseEvent) {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.download) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      ) {
        return;
      }
      if (!window.confirm("Your latest editor changes are not saved yet. Leave anyway?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", protectInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", protectInternalNavigation, true);
    };
  }, []);

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const redo = key === "y" || (key === "z" && event.shiftKey);
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      dispatch({ type: redo ? "redo" : "undo" });
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, []);

  async function saveDraft() {
    if (actionInFlight.current || saveStatusRef.current === "conflict") return;
    actionInFlight.current = true;
    const lifetime = mutationLifetime.current;
    setPendingAction("save");
    failedFingerprint.current = null;
    setError("");
    setMessage("");
    try {
      await flushDraft();
    } catch {
      // The persistent save status presents the actionable failure.
    } finally {
      if (lifetime === mutationLifetime.current) {
        actionInFlight.current = false;
        setPendingAction(null);
      }
    }
  }

  async function loadLatestAfterConflict() {
    const lifetime = mutationLifetime.current;
    const currentBingoId = serverDraft.current.bingoId;
    if (!currentBingoId) return;
    const localDocument = editorDocumentSnapshot(latestState.current);
    try {
      const latest = await api.bingos.getDraft(currentBingoId);
      if (lifetime !== mutationLifetime.current) return;
      const latestState = editorStateFromDraft(latest);
      const latestServerFingerprint = editorDocumentFingerprint(latestState);
      serverDraft.current = { bingoId: latest.bingo_id, version: latest.version };
      savedFingerprintRef.current = latestServerFingerprint;
      setSavedFingerprint(latestServerFingerprint);
      recoveredConflictDocument.current = localDocument;
      setRecoveryAvailable(true);
      preserveRecovery.current = true;
      writeEditorRecovery(accountId, {
        ...editorStateWithDocument(latestState, localDocument),
        version: latest.version,
      });
      dispatch({ type: "hydrate", draft: latest });
      setImageDescriptionValidationKey(null);
      updateSaveStatus("saved");
      setSaveError("");
    } catch (caught) {
      if (lifetime !== mutationLifetime.current) return;
      setSaveError(errorMessage(caught));
      updateSaveStatus("failed");
    }
  }

  async function keepLocalAfterConflict() {
    const lifetime = mutationLifetime.current;
    const currentBingoId = serverDraft.current.bingoId;
    if (!currentBingoId) return;
    try {
      const latest = await api.bingos.getDraft(currentBingoId);
      if (lifetime !== mutationLifetime.current) return;
      const latestServerFingerprint = editorDocumentFingerprint(editorStateFromDraft(latest));
      serverDraft.current = { bingoId: latest.bingo_id, version: latest.version };
      savedFingerprintRef.current = latestServerFingerprint;
      setSavedFingerprint(latestServerFingerprint);
      latestState.current = editorReducer(latestState.current, { type: "saved", draft: latest });
      dispatch({ type: "saved", draft: latest });
      updateSaveStatus("dirty");
      await flushDraft();
    } catch (caught) {
      if (lifetime !== mutationLifetime.current) return;
      if (!isDraftConflict(caught)) {
        setSaveError(errorMessage(caught));
        updateSaveStatus("failed");
      }
    }
  }

  function restoreConflictRecovery() {
    const document = recoveredConflictDocument.current;
    if (!document) return;
    preserveRecovery.current = false;
    recoveredConflictDocument.current = null;
    setRecoveryAvailable(false);
    failedFingerprint.current = null;
    dispatch({ type: "restore-document", document });
    updateSaveStatus("dirty");
  }

  async function publish() {
    if (actionInFlight.current) return;
    setImageDescriptionValidationKey(null);
    if (!state.title.trim()) {
      setError("Add a title before publishing.");
      return;
    }
    if (!state.language) {
      setError("Choose a bingo language before publishing.");
      return;
    }
    if (!Object.values(state.cells).some((cell) => cell.text.trim() || cell.image.asset)) {
      setError("Add text or an image to at least one cell before publishing.");
      return;
    }
    const imageWithoutDescription = Object.values(state.cells).find(
      (cell) => cell.image.asset && !cell.text.trim() && !cell.imageAlt.trim(),
    );
    if (imageWithoutDescription) {
      dispatch({
        type: "select-rectangle",
        anchor: { row: imageWithoutDescription.row, column: imageWithoutDescription.column },
        focus: { row: imageWithoutDescription.row, column: imageWithoutDescription.column },
      });
      setStep("board");
      setError("");
      setImageDescriptionValidationKey(
        cellKey(imageWithoutDescription.row, imageWithoutDescription.column),
      );
      return;
    }
    actionInFlight.current = true;
    const lifetime = mutationLifetime.current;
    setPendingAction("publish");
    setError("");
    setMessage("");
    try {
      await flushDraft();
      if (lifetime !== mutationLifetime.current) return;
      const persistedBingoId = serverDraft.current.bingoId;
      if (!persistedBingoId) throw new Error("The server did not return a bingo identifier.");
      const fingerprint = latestFingerprint.current;
      if (
        pendingPublication.current?.fingerprint !== fingerprint ||
        pendingPublication.current.bingoId !== persistedBingoId
      ) {
        pendingPublication.current = {
          fingerprint,
          bingoId: persistedBingoId,
          idempotencyKey: makeIdempotencyKey(),
        };
      }
      // A lost response may follow a successful publication. Retrying the same
      // document must reuse its key rather than create another revision.
      const published = await api.bingos.publishDraft(
        persistedBingoId,
        pendingPublication.current.idempotencyKey,
      );
      if (lifetime !== mutationLifetime.current) return;
      router.push(`/bingo/${published.id}`);
    } catch (caught) {
      if (lifetime !== mutationLifetime.current) return;
      actionInFlight.current = false;
      if (!isDraftConflict(caught)) setError(errorMessage(caught));
      setPendingAction(null);
    }
  }

  async function waitForExport(job: ExportJob, lifetime: number): Promise<ExportJob> {
    let current = job;
    for (let attempt = 0; attempt < 30 && current.status !== "ready"; attempt += 1) {
      if (current.status === "failed" || current.status === "expired") return current;
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      if (lifetime !== mutationLifetime.current) return current;
      current = await api.exports.get(current.id);
      if (lifetime !== mutationLifetime.current) return current;
    }
    return current;
  }

  async function exportBoard(format: BingoExportFormat) {
    if (actionInFlight.current) return;
    if (!exportAvailable) {
      setError("Publish this bingo before requesting a permanent PNG or PDF export.");
      return;
    }
    actionInFlight.current = true;
    const lifetime = mutationLifetime.current;
    setPendingAction(`export-${format}`);
    setError("");
    setMessage(`Preparing published ${format.toUpperCase()} export…`);
    try {
      const persistedBingoId = serverDraft.current.bingoId ?? state.bingoId;
      if (!persistedBingoId) throw new Error("Publish the bingo before exporting it.");
      const job = await api.exports.create(persistedBingoId, format, makeIdempotencyKey());
      if (lifetime !== mutationLifetime.current) return;
      const completed = await waitForExport(job, lifetime);
      if (lifetime !== mutationLifetime.current) return;
      if (completed.status === "ready" && completed.download_url) {
        window.location.assign(completed.download_url);
      } else if (completed.status === "failed" || completed.status === "expired") {
        throw new Error(completed.error ?? "Export generation failed.");
      } else {
        setMessage("The export is still processing. Try downloading again shortly.");
      }
    } catch (caught) {
      if (lifetime !== mutationLifetime.current) return;
      setError(errorMessage(caught));
    } finally {
      if (lifetime === mutationLifetime.current) {
        actionInFlight.current = false;
        setPendingAction(null);
      }
    }
  }

  function resizeBoard(nextSize: number) {
    const removed = meaningfulCellsRemovedByResize(state, nextSize);
    if (
      removed.length > 0 &&
      !window.confirm(
        `Reducing this board will remove ${removed.length} customized ${removed.length === 1 ? "cell" : "cells"}. This change will autosave; you can use Undo to restore them. Continue?`,
      )
    ) {
      return;
    }
    dispatch({ type: "set-size", size: nextSize });
  }

  const saveStatusView = (
    <EditorSaveStatus
      status={saveStatus}
      error={saveError}
      recoveryAvailable={recoveryAvailable}
      onRetry={() => {
        failedFingerprint.current = null;
        void flushDraft().catch(() => undefined);
      }}
      onLoadLatest={() => void loadLatestAfterConflict()}
      onKeepMine={() => void keepLocalAfterConflict()}
      onRestoreRecovery={restoreConflictRecovery}
    />
  );

  if (authState === "checking" || hydrating) {
    return (
      <main id="main-content" className="create-shell">
        <h1 className="sr-only">{bingoId ? "Edit bingo" : "Create bingo"}</h1>
        <LoadingState label="Loading your draft…" />
      </main>
    );
  }

  if (authState === "error") {
    return (
      <main id="main-content" className="create-shell">
        <h1 className="sr-only">{bingoId ? "Edit bingo" : "Create bingo"}</h1>
        <ErrorState
          message={authError}
          onRetry={() => setAuthCheckVersion((version) => version + 1)}
        />
      </main>
    );
  }

  if (authState === "guest") {
    return (
      <main id="main-content" className="create-shell">
        <EmptyState
          title="Create your own bingo"
          headingLevel={1}
          description="Create an account and verify your email to save and publish bingos. You can play public boards without an account."
          action={{
            href: "/register",
            label: "Create account",
          }}
          secondaryAction={{
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
          headingLevel={1}
          description="Confirm your email address before creating, saving, or publishing bingos."
          action={{
            href: `/verify-email?email=${encodeURIComponent(accountEmail)}`,
            label: "Verification options",
          }}
        />
      </main>
    );
  }

  if (bingoId && error && state.bingoId !== bingoId) {
    return (
      <main id="main-content" className="create-shell">
        <h1 className="sr-only">Edit bingo</h1>
        <ErrorState message={error} onRetry={() => setDraftLoadVersion((version) => version + 1)} />
      </main>
    );
  }

  if (bingoId && state.bingoId !== bingoId) {
    return (
      <main id="main-content" className="create-shell">
        <h1 className="sr-only">Edit bingo</h1>
        <LoadingState label="Loading draft…" />
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
          exportStatus={
            exportLoading ? (
              <LoadingState label="Checking published downloads…" />
            ) : exportError ? (
              <ErrorState
                message="Published downloads could not be checked. Your draft is still editable."
                onRetry={() => setExportCheckVersion((version) => version + 1)}
              />
            ) : null
          }
          saveStatus={saveStatusView}
        />
        {uploading ? (
          <UploadStatus phase={uploadPhase} progress={uploadProgress} onCancel={cancelUpload} />
        ) : null}
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
      <section className="editor-workspace" aria-labelledby="create-title">
        <div className="editor-toolbar">
          <div>
            <h1 id="create-title">{state.bingoId ? "Edit bingo" : "Create bingo"}</h1>
            <p>Click a cell to edit it, or drag across cells to edit several.</p>
          </div>
          <div className="editor-toolbar-actions">
            <div className="editor-history-actions" role="group" aria-label="Edit history">
              <button
                type="button"
                className="button button--secondary"
                disabled={!canUndo(state)}
                onClick={() => dispatch({ type: "undo" })}
              >
                Undo
              </button>
              <button
                type="button"
                className="button button--secondary"
                disabled={!canRedo(state)}
                onClick={() => dispatch({ type: "redo" })}
              >
                Redo
              </button>
            </div>
            <div className="size-control" role="group" aria-label="Bingo size">
              <button
                type="button"
                aria-label="Decrease bingo size"
                disabled={state.size <= MIN_BINGO_SIZE}
                onClick={() => resizeBoard(state.size - 1)}
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
                onClick={() => resizeBoard(state.size + 1)}
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div className="board-actions">
          <label className="button button--secondary upload-button">
            <ImageIcon />
            {uploading === "board" ? "Uploading…" : "Upload background"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
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
        {uploading === "board" ? (
          <UploadStatus phase={uploadPhase} progress={uploadProgress} onCancel={cancelUpload} />
        ) : null}

        <EditorBoard state={state} dispatch={dispatch} />

        <div className="editor-footer">
          <button
            type="button"
            className="button button--secondary"
            disabled={
              Boolean(pendingAction) || uploading !== null || saveStatus === "conflict" || !dirty
            }
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
        {saveStatusView}
        <p
          className={error ? "form-message form-message--error" : "form-message"}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
      </section>
      <CellInspector
        state={state}
        dispatch={dispatch}
        imageDescriptionValidationKey={imageDescriptionValidationKey}
        uploadPending={uploading !== null}
        uploadPhase={uploading === "cell" ? uploadPhase : undefined}
        uploadProgress={uploading === "cell" ? uploadProgress : null}
        onCancelUpload={cancelUpload}
        uploadFeedback={cellUploadFeedback}
        onImageSelected={(file) => void handleUpload("cell", file, "cell_image")}
      />
    </main>
  );
}
