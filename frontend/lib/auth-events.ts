"use client";

export const AUTH_CHANGED_EVENT = "neb:auth-changed";
export const AUTH_REQUIRED_EVENT = "neb:auth-required";
export const AUTH_SYNC_KEY = "neb:auth-sync";
export const AUTH_DIALOG_EVENT = "neb:auth-dialog";
export const AUTH_SIGNED_IN_EVENT = "neb:auth-signed-in";
export const AUTH_SESSION_ENDED_EVENT = "neb:auth-session-ended";
export const AUTH_SIGNED_OUT_EVENT = "neb:auth-signed-out";

export type AuthDialogMode = "login" | "register" | "forgot-password" | "language-preferences";
export interface AuthDialogRequest {
  mode: AuthDialogMode;
  reason?: string | null;
  userId?: string;
}

export function openAuthDialog(request: AuthDialogRequest): void {
  window.dispatchEvent(new CustomEvent<AuthDialogRequest>(AUTH_DIALOG_EVENT, { detail: request }));
}

export function notifySignedIn(): void {
  notifyAuthChanged();
  window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT));
}

export function notifyAuthChanged(): void {
  broadcastAuthChange(false);
}

export function notifySignedOut(): void {
  broadcastAuthChange(true);
}

function broadcastAuthChange(signedOut: boolean): void {
  if (typeof window !== "undefined") {
    if (signedOut) {
      window.dispatchEvent(new Event(AUTH_SIGNED_OUT_EVENT));
      try {
        if (typeof window.BroadcastChannel !== "undefined") {
          const channel = new window.BroadcastChannel(AUTH_SYNC_KEY);
          channel.postMessage("signed-out");
          channel.close();
        }
      } catch {
        // The storage signal remains available when messaging is restricted.
      }
    }
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    try {
      window.localStorage.setItem(
        AUTH_SYNC_KEY,
        `${signedOut ? "signed-out:" : ""}${crypto.randomUUID()}`,
      );
    } catch {
      // Focus revalidation still detects account changes if storage is unavailable.
    }
  }
}
