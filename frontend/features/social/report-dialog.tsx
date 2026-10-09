"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { readReportDraft, rememberReportDraft } from "@/features/social/social-draft-cache";
import { api, errorMessage, fieldValidationMessage } from "@/lib/api/client";
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

interface ReportDialogProps {
  accountId: PublicId;
  targetType: ReportTargetType;
  targetId: PublicId;
  targetLabel: string;
  onClose: () => void;
}

export function ReportDialog(props: ReportDialogProps) {
  return <ReportForm key={`${props.accountId}:${props.targetType}:${props.targetId}`} {...props} />;
}

function ReportForm({ accountId, targetType, targetId, targetLabel, onClose }: ReportDialogProps) {
  const [recovery] = useState(() => readReportDraft(accountId, targetType, targetId));
  const [reason, setReason] = useState<ReportReason>(recovery.reason);
  const [description, setDescription] = useState(recovery.description);
  const [restored, setRestored] = useState(recovery.restored);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"reason" | "description", string>>>(
    {},
  );
  const [sent, setSent] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const actionInFlight = useRef(false);
  const validationFocus = useRef<HTMLElement | null>(null);
  const dirty = !sent && (Boolean(description.trim()) || reason !== "spam");
  useUnsavedChangesWarning(dirty, "Your report has not been sent. Leave this page?");

  useEffect(() => {
    rememberReportDraft(
      accountId,
      targetType,
      targetId,
      sent ? null : { reason, description },
      recovery.generation,
    );
  }, [accountId, targetType, targetId, reason, description, sent, recovery]);

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

  useEffect(() => {
    if (pending || !validationFocus.current) return;
    validationFocus.current.focus();
    validationFocus.current = null;
  }, [pending, fieldErrors]);

  function close() {
    if (actionInFlight.current) return;
    if (dirty && !window.confirm("Discard this report? Your additional context has not been sent."))
      return;
    rememberReportDraft(accountId, targetType, targetId, null, recovery.generation);
    if (dialogRef.current?.open && typeof dialogRef.current.close === "function") {
      dialogRef.current.close();
    }
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionInFlight.current) return;
    const form = event.currentTarget;
    actionInFlight.current = true;
    setPending(true);
    setError("");
    setFieldErrors({});
    try {
      await api.reports.create({
        target_type: targetType,
        target_id: targetId,
        reason,
        description: description.trim(),
      });
      setSent(true);
    } catch (caught) {
      const errors: Partial<Record<"reason" | "description", string>> = {};
      for (const field of ["reason", "description"] as const) {
        const message = fieldValidationMessage(caught, field);
        if (message) errors[field] = message;
      }
      setFieldErrors(errors);
      const firstField = errors.reason ? "reason" : errors.description ? "description" : null;
      if (firstField) {
        validationFocus.current = form.querySelector<HTMLElement>(`[name="${firstField}"]`);
      } else setError(errorMessage(caught));
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
          {restored ? (
            <p className="form-message" role="status">
              Unsent report restored in this tab.
            </p>
          ) : null}
          <p id="report-dialog-description">
            Choose the closest reason and add only the context moderators need. Unsent reports stay
            in this tab for up to 24 hours. Closing the tab or logging out clears them.
          </p>
          <label className="field">
            <span id="report-reason-label">Reason</span>
            <select
              aria-labelledby="report-reason-label"
              aria-invalid={Boolean(fieldErrors.reason)}
              aria-describedby={[
                "report-reason-hint",
                fieldErrors.reason ? "report-reason-error" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              required
              disabled={pending}
              name="reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value as ReportReason);
                setRestored(false);
                setFieldErrors((current) => ({ ...current, reason: undefined }));
              }}
            >
              {reasons.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <small id="report-reason-hint">Required.</small>
            {fieldErrors.reason ? (
              <small id="report-reason-error" className="form-message--error" role="alert">
                {fieldErrors.reason}
              </small>
            ) : null}
          </label>
          <label className="field">
            <span id="report-context-label">Additional context (optional)</span>
            <textarea
              aria-labelledby="report-context-label"
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={[
                "report-context-hint",
                fieldErrors.description ? "report-context-error" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={pending}
              name="description"
              autoComplete="off"
              rows={4}
              maxLength={2_000}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setRestored(false);
                setFieldErrors((current) => ({ ...current, description: undefined }));
              }}
            />
            <small id="report-context-hint">Up to 2,000 characters.</small>
            {fieldErrors.description ? (
              <small id="report-context-error" className="form-message--error" role="alert">
                {fieldErrors.description}
              </small>
            ) : null}
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
