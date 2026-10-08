"use client";

import { useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

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
  const active = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active.current || submissionInFlight.current) return;
    const submittedEmail = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setEmail(submittedEmail);
    submissionInFlight.current = true;
    setPending(true);
    onPendingChange?.(true);
    setMessage("");
    setError("");
    try {
      await api.auth.requestPasswordReset(submittedEmail);
      if (!active.current) return;
      setMessage("If an account exists for that address, a reset email is on its way.");
    } catch (caught) {
      if (active.current) setError(errorMessage(caught));
    } finally {
      if (active.current) {
        submissionInFlight.current = false;
        setPending(false);
        onPendingChange?.(false);
      }
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

interface ResetPasswordRequest {
  uid: string;
  token: string;
  active: boolean;
  pending: boolean;
  succeeded: boolean;
}

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const submittedReset = useRef<ResetPasswordRequest | null>(null);
  const [initializedFor, setInitializedFor] = useState<{ uid: string; token: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const ready = initializedFor?.uid === uid && initializedFor.token === token;

  useEffect(() => {
    let request = submittedReset.current;
    if (!request || request.uid !== uid || request.token !== token) {
      const completed = Boolean(request?.succeeded && !uid && !token);
      request = { uid, token, active: true, pending: false, succeeded: completed };
      submittedReset.current = request;
      setPending(false);
      setPassword("");
      setError("");
      setPasswordError("");
      if (!completed) setMessage("");
    }
    request.active = true;
    setInitializedFor({ uid, token });
    return () => {
      request.active = false;
    };
  }, [uid, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = submittedReset.current;
    if (
      !request?.active ||
      !ready ||
      request.uid !== uid ||
      request.token !== token ||
      request.pending ||
      request.succeeded ||
      message
    )
      return;
    if (!uid || !token) {
      setError("This reset link is incomplete.");
      return;
    }
    const submittedPassword = String(new FormData(event.currentTarget).get("new_password") ?? "");
    setPassword(submittedPassword);
    request.pending = true;
    setPending(true);
    setError("");
    setPasswordError("");
    const ownsResponse = () => request.active && submittedReset.current === request;
    const submittedLocation = new URL(window.location.href);
    try {
      await api.auth.resetPassword({
        uid: request.uid,
        token: request.token,
        new_password: submittedPassword,
      });
      if (!ownsResponse()) return;
      request.succeeded = true;
      setMessage("Password changed. You can now log in.");
      setPassword("");
      const location = new URL(window.location.href);
      if (
        location.pathname === submittedLocation.pathname &&
        location.searchParams.get("uid") === request.uid &&
        location.searchParams.get("token") === request.token
      ) {
        location.searchParams.delete("uid");
        location.searchParams.delete("token");
        window.history.replaceState(
          null,
          "",
          `${location.pathname}${location.search}${location.hash}`,
        );
      }
    } catch (caught) {
      if (!ownsResponse()) return;
      const fieldError = fieldValidationMessage(caught, "new_password");
      if (fieldError) {
        setPasswordError(fieldError);
        formRef.current?.querySelector<HTMLInputElement>('[name="new_password"]')?.focus();
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      request.pending = false;
      if (ownsResponse()) setPending(false);
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
          hint="Use at least 12 characters."
          disabled={!ready}
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
          disabled={!ready || pending || Boolean(message)}
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
