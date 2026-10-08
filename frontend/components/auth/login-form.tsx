"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthLink } from "@/components/auth/auth-link";
import { PasswordField } from "@/components/auth/password-field";
import { LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import { notifySignedIn } from "@/lib/auth-events";
import { openRegistrationOnboarding } from "@/lib/registration-onboarding";

export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/discover";
  }
  try {
    const base = new URL("https://not-enough-bingo.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return "/discover";
    if (
      ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"].includes(
        destination.pathname.replace(/\/+$/, ""),
      )
    ) {
      return "/discover";
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/discover";
  }
}

export function loginNotice(reason: string | null): string {
  if (reason === "session-expired") {
    return "Your session ended. Log in again to continue where you left off.";
  }
  if (reason === "deletion-scheduled") {
    return "Account deletion is scheduled and all sessions were signed out. Log back in to review or cancel it during the grace period.";
  }
  return "";
}

export function LoginForm({
  presentation = "page",
  reason,
  onSuccess,
  onPendingChange,
}: {
  presentation?: "page" | "dialog";
  reason?: string | null;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const submissionInFlight = useRef(false);
  const requestOwner = useRef<{ onPendingChange?: (pending: boolean) => void } | null>(null);
  const [error, setError] = useState("");
  const [sessionStatus, setSessionStatus] = useState<"checking" | "guest" | "error">("checking");
  const next = searchParams.get("next");
  const loginReason = reason === undefined ? searchParams.get("reason") : reason;
  const notice = loginNotice(loginReason);

  useEffect(() => {
    const owner = { onPendingChange };
    requestOwner.current = owner;
    if (submissionInFlight.current) onPendingChange?.(true);
    return () => {
      if (requestOwner.current === owner) requestOwner.current = null;
    };
  }, [loginReason, next, onPendingChange, onSuccess, presentation]);

  useEffect(() => {
    let active = true;
    api.auth
      .session()
      .then((user) => {
        if (!active) return;
        if (user) {
          if (onSuccess) {
            onSuccess();
            notifySignedIn();
          } else router.replace(safeNext(next));
          openRegistrationOnboarding(user.id);
        } else setSessionStatus("guest");
      })
      .catch(() => {
        if (active) setSessionStatus("error");
      });
    return () => {
      active = false;
    };
  }, [next, onSuccess, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const owner = requestOwner.current;
    if (!owner || submissionInFlight.current) return;
    const data = new FormData(event.currentTarget);
    const submittedEmail = String(data.get("email") ?? "").trim();
    const submittedPassword = String(data.get("password") ?? "");
    setEmail(submittedEmail);
    setPassword(submittedPassword);
    submissionInFlight.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError("");
    const ownsResponse = () => requestOwner.current === owner;
    try {
      const { user } = await api.auth.login({ email: submittedEmail, password: submittedPassword });
      if (!ownsResponse()) {
        // The session changed even if this form was replaced while the request was pending.
        notifySignedIn();
        return;
      }
      if (onSuccess) onSuccess();
      else {
        router.replace(safeNext(next));
        router.refresh();
      }
      notifySignedIn();
      openRegistrationOnboarding(user.id);
    } catch (caught) {
      if (!ownsResponse()) return;
      submissionInFlight.current = false;
      setError(errorMessage(caught));
      setPending(false);
    } finally {
      if (ownsResponse()) onPendingChange?.(false);
      else if (requestOwner.current) {
        submissionInFlight.current = false;
        setPending(false);
        requestOwner.current.onPendingChange?.(false);
      }
    }
  }

  return (
    <AuthShell
      presentation={presentation}
      eyebrow="Welcome back"
      title="Log in"
      description="Use the email address connected to your account."
      footer={{ text: "New here?", href: "/register", label: "Create an account" }}
    >
      {sessionStatus === "checking" ? <LoadingState label="Checking your session…" /> : null}
      {sessionStatus !== "checking" ? (
        <form className="stack-form" onSubmit={submit}>
          {sessionStatus === "error" ? (
            <p className="form-message" role="status">
              We could not check your current session. You can still try to log in.
            </p>
          ) : null}
          {notice ? (
            <p className="form-message" role="status">
              {notice}
            </p>
          ) : null}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <PasswordField
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="form-row">
            <AuthLink href="/forgot-password">Forgot password?</AuthLink>
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
      ) : null}
    </AuthShell>
  );
}
