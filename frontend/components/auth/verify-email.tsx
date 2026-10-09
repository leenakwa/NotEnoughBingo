"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthLink } from "@/components/auth/auth-link";
import { api, ApiClientError, errorMessage } from "@/lib/api/client";
import { notifyAuthChanged } from "@/lib/auth-events";
import { markRegistrationVerified } from "@/lib/registration-onboarding";

interface VerificationRequest {
  token: string;
  mode: "registration" | "email-change";
  active: boolean;
  started: boolean;
  pending: boolean;
  succeeded: boolean;
  onPendingChange?: (pending: boolean) => void;
}

interface ResendRequest {
  token: string | null;
  email: string | null;
  mode: "registration" | "email-change";
  active: boolean;
  pending: boolean;
  onPendingChange?: (pending: boolean) => void;
}

function canRetryVerification(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof ApiClientError &&
      (error.status === 0 ||
        error.status === 408 ||
        error.status === 429 ||
        error.status >= 500 ||
        error.code === "invalid_response"))
  );
}

export function VerifyEmail({
  mode = "registration",
  registrationEmail,
  presentation = "page",
  onPendingChange,
}: {
  mode?: "registration" | "email-change";
  registrationEmail?: string;
  presentation?: "page" | "dialog";
  onPendingChange?: (pending: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const token = registrationEmail === undefined ? searchParams.get("token") : null;
  const email = registrationEmail ?? searchParams.get("email");
  const [state, setState] = useState<"waiting" | "verifying" | "verified" | "error">(
    token ? "verifying" : "waiting",
  );
  const [message, setMessage] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [resending, setResending] = useState(false);
  const submittedToken = useRef<VerificationRequest | null>(null);
  const resendRequest = useRef<ResendRequest | null>(null);

  const verify = useCallback(async (request: VerificationRequest) => {
    if (!request.active || request.pending || request.succeeded) return;
    request.started = true;
    request.pending = true;
    setState("verifying");
    setMessage("");
    request.onPendingChange?.(true);
    const ownsResponse = () => request.active && submittedToken.current === request;
    try {
      const user = await (request.mode === "email-change"
        ? api.auth.confirmEmailChange(request.token)
        : api.auth.verifyEmail(request.token));
      if (!ownsResponse()) return;
      request.succeeded = true;
      if (request.mode === "email-change") notifyAuthChanged();
      else if (user) markRegistrationVerified(user.id);
      setState("verified");
      setRetryable(false);
      window.history.replaceState(null, "", window.location.pathname);
      setMessage(
        request.mode === "email-change"
          ? "Your new email address is confirmed. Use it the next time you log in."
          : "Your email address is verified.",
      );
    } catch (caught) {
      if (ownsResponse()) {
        setState("error");
        setRetryable(canRetryVerification(caught));
        setMessage(errorMessage(caught) || "This link could not be confirmed. Request a new link.");
      }
    } finally {
      request.pending = false;
      if (ownsResponse()) request.onPendingChange?.(false);
    }
  }, []);

  useEffect(() => {
    let request = resendRequest.current;
    if (request?.mode !== mode || request.token !== token || request.email !== email) {
      request = { token, email, mode, active: true, pending: false };
      resendRequest.current = request;
      setResending(false);
      if (!token && email) {
        setState("waiting");
        setMessage("");
        setRetryable(false);
      }
    }
    request.active = true;
    request.onPendingChange = onPendingChange;
    if (request.pending) onPendingChange?.(true);
    return () => {
      request.active = false;
      if (request.pending) request.onPendingChange?.(false);
    };
  }, [email, mode, onPendingChange, token]);

  useEffect(() => {
    if (!token) {
      if (!submittedToken.current?.succeeded || submittedToken.current.mode !== mode) {
        setState("waiting");
        setMessage("");
        setRetryable(false);
      }
      return;
    }
    let request = submittedToken.current;
    if (request?.token !== token || request.mode !== mode) {
      request = { token, mode, active: true, started: false, pending: false, succeeded: false };
      submittedToken.current = request;
      setRetryable(false);
    }
    request.active = true;
    request.onPendingChange = onPendingChange;
    // StrictMode reattaches the same request instead of consuming its single-use token twice.
    if (!request.started) void verify(request);
    else if (request.pending) onPendingChange?.(true);
    return () => {
      request.active = false;
      if (request.pending) request.onPendingChange?.(false);
    };
  }, [mode, onPendingChange, token, verify]);

  function retry() {
    const request = submittedToken.current;
    if (
      !retryable ||
      resendRequest.current?.pending ||
      request?.token !== token ||
      request.mode !== mode
    )
      return;
    void verify(request);
  }

  async function resend() {
    const request = resendRequest.current;
    if (
      !email ||
      mode !== "registration" ||
      !request?.active ||
      request.pending ||
      request.token !== token ||
      request.email !== email ||
      request.mode !== mode ||
      (submittedToken.current?.active && submittedToken.current.pending) ||
      state === "verifying"
    )
      return;
    request.pending = true;
    setResending(true);
    request.onPendingChange?.(true);
    setMessage("");
    const ownsResponse = () => request.active && resendRequest.current === request;
    try {
      await api.auth.resendVerification(email);
      if (!ownsResponse()) return;
      setState("waiting");
      setRetryable(false);
      setMessage(
        "If this registration is pending, check your inbox for a verification link. You can request another after a short wait.",
      );
    } catch (caught) {
      if (ownsResponse()) {
        setState("error");
        setMessage(errorMessage(caught));
      }
    } finally {
      request.pending = false;
      if (ownsResponse()) {
        setResending(false);
        request.onPendingChange?.(false);
      }
    }
  }

  return (
    <AuthShell
      presentation={presentation}
      eyebrow={mode === "email-change" ? "Change email" : "Email verification"}
      title={
        state === "verified"
          ? mode === "email-change"
            ? "Email changed"
            : "Email verified"
          : "Check your inbox"
      }
      description={
        state === "waiting"
          ? mode === "email-change"
            ? "Open the confirmation link we sent to your new address."
            : `If this registration is pending, check for a verification link${email ? ` at ${email}` : ""}.`
          : "Verification links are time-limited and single-use."
      }
    >
      <p
        className={state === "error" ? "form-message form-message--error" : "form-message"}
        role={state === "error" ? "alert" : "status"}
      >
        {state === "verifying" ? "Verifying…" : message}
      </p>
      {token && retryable && state !== "verified" ? (
        <button
          type="button"
          className="button button--primary"
          disabled={state === "verifying" || resending}
          onClick={retry}
        >
          {state === "verifying" ? "Verifying…" : "Retry"}
        </button>
      ) : null}
      {token && state === "error" && !retryable ? (
        mode === "email-change" ? (
          <p>
            Check your profile to see whether your email changed. If it did not, request a new link
            in Account settings. <AuthLink href="/profile">Back to profile</AuthLink>.
          </p>
        ) : (
          <p>
            If you already verified your email, <AuthLink href="/login">log in</AuthLink>.
            Otherwise, <AuthLink href="/register">register again</AuthLink> to request a new
            verification link.
          </p>
        )
      ) : null}
      {state === "verified" ? (
        <AuthLink
          className="button button--primary"
          href={mode === "email-change" ? "/profile" : "/login"}
        >
          {mode === "email-change" ? "Back to profile" : "Continue to log in"}
        </AuthLink>
      ) : null}
      {mode === "registration" && state !== "verified" && email ? (
        <>
          <button
            type="button"
            className="button button--secondary"
            disabled={resending || state === "verifying"}
            onClick={() => void resend()}
          >
            {resending ? "Sending…" : "Resend verification email"}
          </button>
          <p>
            Already have an account? <AuthLink href="/login">Log in</AuthLink> or{" "}
            <AuthLink href="/forgot-password">reset your password</AuthLink>.
          </p>
        </>
      ) : null}
    </AuthShell>
  );
}
