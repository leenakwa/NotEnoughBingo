"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthLink } from "@/components/auth/auth-link";
import { api, errorMessage } from "@/lib/api/client";
import { notifyAuthChanged } from "@/lib/auth-events";
import { markRegistrationVerified } from "@/lib/registration-onboarding";

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
  const [resending, setResending] = useState(false);
  const submittedToken = useRef<string | null>(null);
  const resendInFlight = useRef(false);

  useEffect(() => {
    if (!token || submittedToken.current === token) return;
    submittedToken.current = token;
    (mode === "email-change" ? api.auth.confirmEmailChange(token) : api.auth.verifyEmail(token))
      .then((user) => {
        if (mode === "email-change") notifyAuthChanged();
        else if (user) markRegistrationVerified(user.id);
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
    if (!email || resendInFlight.current || state === "verifying") return;
    resendInFlight.current = true;
    setResending(true);
    onPendingChange?.(true);
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
      resendInFlight.current = false;
      setResending(false);
      onPendingChange?.(false);
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
