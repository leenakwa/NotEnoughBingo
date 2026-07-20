"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { api, errorMessage } from "@/lib/api/client";

export function VerifyEmail() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const [state, setState] = useState<"waiting" | "verifying" | "verified" | "error">(
    token ? "verifying" : "waiting",
  );
  const [message, setMessage] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.auth
      .verifyEmail(token)
      .then(() => {
        setState("verified");
        setMessage("Your email address is verified.");
      })
      .catch((caught) => {
        setState("error");
        setMessage(errorMessage(caught));
      });
  }, [token]);

  async function resend() {
    if (!email || resending) return;
    setResending(true);
    setMessage("");
    try {
      await api.auth.resendVerification(email);
      setState("waiting");
      setMessage("If this registration is pending, a fresh link is on its way.");
    } catch (caught) {
      setState("error");
      setMessage(errorMessage(caught));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Email verification"
      title={state === "verified" ? "Email verified" : "Check your inbox"}
      description={
        state === "waiting"
          ? `We sent a verification link${email ? ` to ${email}` : ""}.`
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
        <Link className="button button--primary" href="/login">
          Continue to login
        </Link>
      ) : null}
      {state !== "verified" && email ? (
        <button
          type="button"
          className="button button--secondary"
          disabled={resending || state === "verifying"}
          onClick={() => void resend()}
        >
          {resending ? "Sending…" : "Resend verification email"}
        </button>
      ) : null}
    </AuthShell>
  );
}
