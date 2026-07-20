"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { api, errorMessage } from "@/lib/api/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await api.auth.requestPasswordReset(email);
    } catch {
      // Deliberately keep the same response for unknown accounts and transient
      // delivery failures to avoid turning recovery into an enumeration oracle.
    } finally {
      setMessage("If an account exists for that address, a reset email is on its way.");
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
        <p className="form-message" role="status">
          {message}
        </p>
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
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
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
