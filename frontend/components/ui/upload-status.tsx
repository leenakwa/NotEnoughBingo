import type { UploadPhase, UploadProgress } from "@/lib/uploads";

const phaseLabels: Record<UploadPhase, string> = {
  preparing: "Preparing image…",
  uploading: "Uploading image…",
  processing: "Processing image…",
};

export function UploadStatus({
  phase,
  progress,
  onCancel,
}: {
  phase: UploadPhase;
  progress?: UploadProgress | null;
  onCancel: () => void;
}) {
  const percentage =
    phase === "uploading" &&
    progress &&
    Number.isFinite(progress.loaded) &&
    progress.loaded >= 0 &&
    progress.total !== null &&
    Number.isFinite(progress.total) &&
    progress.total > 0
      ? Math.floor(Math.min(progress.loaded / progress.total, 1) * 100)
      : null;

  return (
    <div className="upload-status" role="status" aria-live="polite">
      <span>
        {phaseLabels[phase]}
        {percentage === null ? "" : ` ${percentage}%`}
      </span>
      <progress aria-label={phaseLabels[phase]} max={100} value={percentage ?? undefined} />
      <button type="button" className="button button--secondary" onClick={onCancel}>
        Cancel upload
      </button>
    </div>
  );
}
