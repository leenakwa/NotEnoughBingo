"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { api, errorMessage } from "@/lib/api/client";
import type { PublicId, ReportReason, ReportTargetType } from "@/lib/api/types";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

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
  const actionInFlight = useRef(false);
  const dirty = !sent && Boolean(description.trim());
  useUnsavedChangesWarning(dirty, "Your report has not been sent. Leave and discard it?");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  function close() {
    if (actionInFlight.current) return;
    if (dirty && !window.confirm("Discard this report? Your additional context has not been sent."))
      return;
    if (dialogRef.current?.open && typeof dialogRef.current.close === "function") {
      dialogRef.current.close();
    }
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionInFlight.current) return;
    actionInFlight.current = true;
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
      actionInFlight.current = false;
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="report-dialog"
      aria-labelledby="report-dialog-title"
      aria-describedby={sent ? "report-success" : "report-dialog-description"}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const focusable = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]",
          ),
        );
        const first = focusable[0];
        if (!first) return;
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
        const nextIndex =
          currentIndex < 0
            ? event.shiftKey
              ? focusable.length - 1
              : 0
            : event.shiftKey
              ? (currentIndex - 1 + focusable.length) % focusable.length
              : (currentIndex + 1) % focusable.length;
        event.preventDefault();
        (focusable[nextIndex] ?? first).focus();
      }}
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
          <p id="report-success" role="status">
            Report received. A moderator will review the content and its context.
          </p>
          <button type="button" className="button button--primary" autoFocus onClick={close}>
            Done
          </button>
        </div>
      ) : (
        <form className="stack-form" onSubmit={submit}>
          <p id="report-dialog-description">
            Choose the closest reason and add only the context moderators need.
          </p>
          <label className="field">
            <span id="report-reason-label">Reason</span>
            <select
              aria-labelledby="report-reason-label"
              aria-describedby="report-reason-hint"
              required
              disabled={pending}
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as ReportReason)}
            >
              {reasons.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <small id="report-reason-hint">Required.</small>
          </label>
          <label className="field">
            <span id="report-context-label">Additional context (optional)</span>
            <textarea
              aria-labelledby="report-context-label"
              aria-describedby="report-context-hint"
              disabled={pending}
              name="description"
              autoComplete="off"
              rows={4}
              maxLength={2_000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <small id="report-context-hint">Up to 2,000 characters.</small>
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
