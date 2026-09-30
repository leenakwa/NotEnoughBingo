"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { api, errorMessage } from "@/lib/api/client";
import { notifyAuthChanged } from "@/lib/auth-events";

export function VerifyEmail({ mode = "registration" }: { mode?: "registration" | "email-change" }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const [state, setState] = useState<"waiting" | "verifying" | "verified" | "error">(
    token ? "verifying" : "waiting",
  );
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);
  const submittedToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token || submittedToken.current === token) return;
    submittedToken.current = token;
    (mode === "email-change" ? api.auth.confirmEmailChange(token) : api.auth.verifyEmail(token))
      .then(() => {
        if (mode === "email-change") notifyAuthChanged();
        setState("verified");
        window.history.replaceState(null, "", window.location.pathname);
        setMessage(
          mode === "email-change"
            ? "Your new email address is confirmed. Use it the next time you log in."
            : "Your email address is verified.",
        );
      })
      .catch((caught) => {
        setState("error");
        setMessage(errorMessage(caught));
      });
  }, [mode, token]);

  async function resend() {
    if (!email || resending) return;
    setResending(true);
    setMessage("");
    try {
      await api.auth.resendVerification(email);
      setState("waiting");
      setMessage(
        "If this registration is pending, check your inbox for a verification link. You can request another after a short wait.",
      );
    } catch (caught) {
      setState("error");
      setMessage(errorMessage(caught));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
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
      {state === "verified" ? (
        <Link
          className="button button--primary"
          href={mode === "email-change" ? "/profile" : "/login"}
        >
          {mode === "email-change" ? "Back to profile" : "Continue to log in"}
        </Link>
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
            Already have an account? <Link href="/login">Log in</Link> or{" "}
            <Link href="/forgot-password">reset your password</Link>.
          </p>
        </>
      ) : null}
    </AuthShell>
  );
}
