"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { api, errorMessage } from "@/lib/api/client";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api.auth.register({ email, username, password });
      router.replace(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (caught) {
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
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Username</span>
          <input
            autoComplete="username"
            required
            minLength={3}
            maxLength={30}
            pattern="[A-Za-z0-9_]+"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <small>Letters, numbers, and underscores.</small>
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <small>Use at least 12 characters.</small>
        </label>
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
