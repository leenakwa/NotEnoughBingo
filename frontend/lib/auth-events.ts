"use client";

export const AUTH_CHANGED_EVENT = "neb:auth-changed";
export const AUTH_REQUIRED_EVENT = "neb:auth-required";
export const AUTH_SYNC_KEY = "neb:auth-sync";

export function notifyAuthChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    try {
      window.localStorage.setItem(AUTH_SYNC_KEY, crypto.randomUUID());
    } catch {
      // Focus revalidation still detects account changes if storage is unavailable.
    }
  }
}
