"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthLink } from "@/components/auth/auth-link";
import { PasswordField } from "@/components/auth/password-field";
import { api, errorMessage, fieldValidationMessage } from "@/lib/api/client";

export function ForgotPasswordForm({
  presentation = "page",
  onPendingChange,
}: {
  presentation?: "page" | "dialog";
  onPendingChange?: (pending: boolean) => void;
} = {}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const submissionInFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setPending(true);
    onPendingChange?.(true);
    setMessage("");
    setError("");
    try {
      await api.auth.requestPasswordReset(email.trim());
      setMessage("If an account exists for that address, a reset email is on its way.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      submissionInFlight.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <AuthShell
      presentation={presentation}
      eyebrow="Account recovery"
      title="Reset your password"
      description="We will email a time-limited reset link."
      footer={{ text: "Remembered it?", href: "/login", label: "Back to log in" }}
    >
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button className="button button--primary" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const submissionInFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlight.current || message) return;
    if (!uid || !token) {
      setError("This reset link is incomplete.");
      return;
    }
    submissionInFlight.current = true;
    setPending(true);
    setError("");
    setPasswordError("");
    try {
      await api.auth.resetPassword({
        uid,
        token,
        new_password: password,
      });
      setMessage("Password changed. You can now log in.");
      setPassword("");
      window.history.replaceState(null, "", window.location.pathname);
    } catch (caught) {
      const fieldError = fieldValidationMessage(caught, "new_password");
      if (fieldError) {
        setPasswordError(fieldError);
        formRef.current?.querySelector<HTMLInputElement>('[name="new_password"]')?.focus();
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      submissionInFlight.current = false;
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Reset links are single-use and expire for your safety."
    >
      <form ref={formRef} className="stack-form" onSubmit={submit}>
        <PasswordField
          label="New password"
          name="new_password"
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setPasswordError("");
          }}
          error={passwordError}
        />
        <button
          className="button button--primary"
          type="submit"
          disabled={pending || Boolean(message)}
        >
          {pending ? "Updating…" : "Update password"}
        </button>
        <p
          className={error ? "form-message form-message--error" : "form-message"}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </p>
        {message ? <AuthLink href="/login">Continue to log in</AuthLink> : null}
      </form>
    </AuthShell>
  );
}
