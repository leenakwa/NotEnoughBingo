"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { LanguageOnboarding } from "@/components/auth/language-onboarding";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { RegisterForm } from "@/components/auth/register-form";
import { VerifyEmail } from "@/components/auth/verify-email";
import type { AuthDialogRequest } from "@/lib/auth-events";

export default function AuthDialogWindow({
  request,
  onClose,
}: {
  request: AuthDialogRequest;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState<string>();
  const [view, setView] = useState(request);

  useEffect(() => {
    if (!pending && request !== view) {
      setView(request);
      setRegistrationEmail(undefined);
      setReminder(false);
    }
  }, [request, view, pending]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    const previousRootOverflow = root.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    dialog.showModal();
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) dialog.close();
      root.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const registered = useCallback((email: string) => setRegistrationEmail(email), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.scrollTop = 0;
    dialog
      .querySelector<HTMLButtonElement>(
        "[data-modal-autofocus], .auth-dialog__close:not(:disabled)",
      )
      ?.focus({ preventScroll: true });
  }, [view, registrationEmail, reminder]);

  return (
    <dialog
      ref={dialogRef}
      className={`auth-dialog${view.mode === "language-preferences" ? (reminder ? " auth-dialog--compact" : " auth-dialog--languages") : ""}`}
      aria-labelledby="auth-dialog-title"
      onClickCapture={(event) => {
        if (pending && event.target instanceof Element && event.target.closest("a")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending && !reminder) onClose();
      }}
      onClick={(event) => {
        if (pending || reminder || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]',
          ),
        );
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if (
          index === -1 ||
          (event.shiftKey && index === 0) ||
          (!event.shiftKey && index === controls.length - 1)
        ) {
          event.preventDefault();
          controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
        }
      }}
    >
      {!reminder ? (
        <button
          type="button"
          className="icon-button auth-dialog__close"
          aria-label="Close account dialog"
          title="Close"
          disabled={pending}
          onClick={onClose}
        >
          ×
        </button>
      ) : null}
      {view.mode === "language-preferences" && view.userId ? (
        <LanguageOnboarding
          key={view.userId}
          userId={view.userId}
          onComplete={onClose}
          onPendingChange={setPending}
          onReminderChange={setReminder}
        />
      ) : registrationEmail ? (
        <VerifyEmail
          key={registrationEmail}
          registrationEmail={registrationEmail}
          presentation="dialog"
          onPendingChange={setPending}
        />
      ) : view.mode === "register" ? (
        <RegisterForm
          presentation="dialog"
          onRegistered={registered}
          onPendingChange={setPending}
        />
      ) : view.mode === "forgot-password" ? (
        <ForgotPasswordForm presentation="dialog" onPendingChange={setPending} />
      ) : (
        <LoginForm
          presentation="dialog"
          reason={view.reason ?? null}
          onSuccess={onClose}
          onPendingChange={setPending}
        />
      )}
    </dialog>
  );
}
