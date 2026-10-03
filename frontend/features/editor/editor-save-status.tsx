export type EditorSaveStatusValue =
  "pristine" | "dirty" | "saving" | "saved" | "failed" | "conflict";

const labels: Record<EditorSaveStatusValue, string> = {
  pristine: "Changes will save automatically.",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed — Retry",
  conflict: "This draft was changed in another session.",
};

export function EditorSaveStatus({
  status,
  error,
  onRetry,
  onLoadLatest,
  onKeepMine,
  recoveryAvailable,
  onRestoreRecovery,
}: {
  status: EditorSaveStatusValue;
  error?: string;
  onRetry: () => void;
  onLoadLatest: () => void;
  onKeepMine: () => void;
  recoveryAvailable: boolean;
  onRestoreRecovery: () => void;
}) {
  return (
    <div
      className={`save-status save-status--${status}`}
      role={status === "failed" || status === "conflict" ? "alert" : "status"}
      aria-live="polite"
    >
      <span>{labels[status]}</span>
      {status === "failed" ? (
        <>
          {error ? <small>{error}</small> : null}
          <button type="button" className="text-button" onClick={onRetry}>
            Retry now
          </button>
        </>
      ) : null}
      {status === "conflict" ? (
        <>
          <small>Your local edits are preserved. Choose which version to continue with.</small>
          <span className="conflict-actions">
            <button type="button" className="button button--secondary" onClick={onLoadLatest}>
              Load latest
            </button>
            <button type="button" className="button button--primary" onClick={onKeepMine}>
              Keep and save mine
            </button>
          </span>
        </>
      ) : null}
      {recoveryAvailable && status !== "conflict" ? (
        <button type="button" className="text-button" onClick={onRestoreRecovery}>
          Restore my unsaved version
        </button>
      ) : null}
    </div>
  );
}
