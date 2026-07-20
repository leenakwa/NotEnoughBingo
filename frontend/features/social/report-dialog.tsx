"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api/client";
import type { PublicId, ReportReason, ReportTargetType } from "@/lib/api/types";

const reasons: Array<{ value: ReportReason; label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech" },
  { value: "sexual", label: "Sexual content" },
  { value: "violence", label: "Violence" },
  { value: "self_harm", label: "Self-harm" },
  { value: "impersonation", label: "Impersonation" },
  { value: "copyright", label: "Copyright" },
  { value: "other", label: "Other" },
];

export function ReportDialog({
  targetType,
  targetId,
  targetLabel,
  onClose,
}: {
  targetType: ReportTargetType;
  targetId: PublicId;
  targetLabel: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ReportReason>("spam");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);

  function close() {
    if (pending) return;
    if (dialogRef.current?.open && typeof dialogRef.current.close === "function") {
      dialogRef.current.close();
    }
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await api.reports.create({
        target_type: targetType,
        target_id: targetId,
        reason,
        description: description.trim(),
      });
      setSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="report-dialog"
      aria-labelledby="report-dialog-title"
      aria-describedby="report-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="report-dialog__heading">
        <div>
          <p className="eyebrow">Community safety</p>
          <h2 id="report-dialog-title">Report {targetLabel}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close report dialog"
          disabled={pending}
          onClick={close}
        >
          ×
        </button>
      </div>
      {sent ? (
        <div>
          <p role="status">Report received. A moderator will review the content and its context.</p>
          <button type="button" className="button button--primary" onClick={close}>
            Done
          </button>
        </div>
      ) : (
        <form className="stack-form" onSubmit={submit}>
          <p id="report-dialog-description">
            Choose the closest reason and add only the context moderators need.
          </p>
          <label className="field">
            <span>Reason</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as ReportReason)}
            >
              {reasons.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Additional context (optional)</span>
            <textarea
              rows={4}
              maxLength={2_000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="inline-actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={pending}>
              {pending ? "Sending…" : "Send report"}
            </button>
          </div>
          {error ? (
            <p className="form-message form-message--error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </dialog>
  );
}
