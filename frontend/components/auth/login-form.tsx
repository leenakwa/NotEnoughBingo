"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FormEvent, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { api, errorMessage } from "@/lib/api/client";
import { notifyAuthChanged } from "@/lib/auth-events";

export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/discover";
  }
  try {
    const base = new URL("https://not-enough-bingo.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return "/discover";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/discover";
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api.auth.login({ email, password });
      notifyAuthChanged();
      router.replace(safeNext(searchParams.get("next")));
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Log in"
      description="Use the email address connected to your account."
      footer={{ text: "New here?", href: "/register", label: "Create an account" }}
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
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <div className="form-row">
          <Link href="/forgot-password">Forgot password?</Link>
          <button className="button button--primary" type="submit" disabled={pending}>
            {pending ? "Logging in…" : "Log in"}
          </button>
        </div>
        {error ? (
          <p className="form-message form-message--error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </AuthShell>
  );
}
