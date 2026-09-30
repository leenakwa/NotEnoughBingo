"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { api, errorMessage } from "@/lib/api/client";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const submissionInFlight = useRef(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setPending(true);
    setError("");
    try {
      await api.auth.register({ email: email.trim(), username: username.trim(), password });
      router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    } catch (caught) {
      submissionInFlight.current = false;
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Create your account"
      title="Join Not Enough Bingo"
      description="Publishing requires a verified email address. Playing public boards does not."
      footer={{ text: "Already have an account?", href: "/login", label: "Log in" }}
    >
      <form className="stack-form" onSubmit={submit}>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Username</span>
          <input
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={30}
            pattern="\s*[A-Za-z0-9_]+\s*"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onBlur={(event) => setUsername(event.target.value.trim())}
          />
          <small>3–30 characters. Letters, numbers, and underscores.</small>
        </label>
        <PasswordField
          label="Password"
          autoComplete="new-password"
          minLength={12}
          hint="Use at least 12 characters. Avoid common words and your username."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
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
