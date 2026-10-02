"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { api, errorMessage, fieldValidationMessage } from "@/lib/api/client";

type RegistrationField = "email" | "username" | "password";

export function RegisterForm({
  presentation = "page",
  onRegistered,
  onPendingChange,
}: {
  presentation?: "page" | "dialog";
  onRegistered?: (email: string) => void;
  onPendingChange?: (pending: boolean) => void;
} = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const submissionInFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RegistrationField, string>>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError("");
    setFieldErrors({});
    try {
      await api.auth.register({ email: email.trim(), username: username.trim(), password });
      if (onRegistered) onRegistered(email.trim());
      else router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } catch (caught) {
      submissionInFlight.current = false;
      const errors: Partial<Record<RegistrationField, string>> = {};
      for (const field of ["email", "username", "password"] as const) {
        const message = fieldValidationMessage(caught, field);
        if (message) errors[field] = message;
      }
      setFieldErrors(errors);
      const firstField = (["email", "username", "password"] as const).find(
        (field) => errors[field],
      );
      if (firstField) {
        formRef.current?.querySelector<HTMLInputElement>(`[name="${firstField}"]`)?.focus();
      } else {
        setError(errorMessage(caught));
      }
      setPending(false);
    } finally {
      onPendingChange?.(false);
    }
  }

  return (
    <AuthShell
      presentation={presentation}
      eyebrow="Create your account"
      title="Join Not Enough Bingo"
      description="Publishing requires a verified email address. Playing public boards does not."
      footer={{ text: "Already have an account?", href: "/login", label: "Log in" }}
    >
      <form ref={formRef} className="stack-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "registration-email-error" : undefined}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
          />
          {fieldErrors.email ? (
            <small id="registration-email-error" className="form-message--error" role="alert">
              {fieldErrors.email}
            </small>
          ) : null}
        </label>
        <label className="field">
          <span>Username</span>
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={30}
            pattern="\s*[A-Za-z0-9_]+\s*"
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? "registration-username-error" : undefined}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setFieldErrors((current) => ({ ...current, username: undefined }));
            }}
            onBlur={(event) => setUsername(event.target.value.trim())}
          />
          <small>3–30 characters. Letters, numbers, and underscores.</small>
          {fieldErrors.username ? (
            <small id="registration-username-error" className="form-message--error" role="alert">
              {fieldErrors.username}
            </small>
          ) : null}
        </label>
        <PasswordField
          label="Password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          hint="Use at least 12 characters. Avoid common words and your username."
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          error={fieldErrors.password}
        />
        <button className="button button--primary" type="submit" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </button>
        {error ? (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
