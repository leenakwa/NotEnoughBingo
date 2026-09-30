import type { UploadPhase } from "@/lib/uploads";

const phaseLabels: Record<UploadPhase, string> = {
  preparing: "Preparing image…",
  uploading: "Uploading image…",
  processing: "Processing image…",
};

export function UploadStatus({ phase, onCancel }: { phase: UploadPhase; onCancel: () => void }) {
  return (
    <div className="upload-status" role="status" aria-live="polite">
      <span>{phaseLabels[phase]}</span>
      <progress aria-label={phaseLabels[phase]} />
      <button type="button" className="button button--secondary" onClick={onCancel}>
        Cancel upload
      </button>
    </div>
  );
}
