"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { api, errorMessage } from "@/lib/api/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage("");
    setError("");
    try {
      await api.auth.requestPasswordReset(email.trim());
      setMessage("If an account exists for that address, a reset email is on its way.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="We will email a time-limited reset link."
      footer={{ text: "Remembered it?", href: "/login", label: "Back to login" }}
    >
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
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
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uid || !token) {
      setError("This reset link is incomplete.");
      return;
    }
    setPending(true);
    setError("");
    try {
      await api.auth.resetPassword({
        uid,
        token,
        new_password: password,
      });
      setMessage("Password changed. You can now log in.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Reset links are single-use and expire for your safety."
    >
      <form className="stack-form" onSubmit={submit}>
        <PasswordField
          label="New password"
          autoComplete="new-password"
          minLength={12}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
        {message ? <Link href="/login">Continue to login</Link> : null}
      </form>
    </AuthShell>
  );
}
