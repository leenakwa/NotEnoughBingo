"use client";

import { openAuthDialog } from "@/lib/auth-events";

const REGISTRATION_ONBOARDING_KEY = "neb:registration-onboarding:v1";
export const LANGUAGE_PREFERENCES_CHANGED_EVENT = "neb:language-preferences-changed";
let verifiedRegistrationId: string | null = null;

export function markRegistrationVerified(userId: string): void {
  verifiedRegistrationId = userId;
  try {
    window.sessionStorage.setItem(REGISTRATION_ONBOARDING_KEY, userId);
  } catch {
    // The current registration flow still works when browser storage is unavailable.
  }
}

export function openRegistrationOnboarding(userId: string): void {
  let pendingId = verifiedRegistrationId;
  try {
    pendingId = window.sessionStorage.getItem(REGISTRATION_ONBOARDING_KEY) ?? pendingId;
  } catch {
    // Use the in-memory marker for the current tab.
  }
  if (pendingId !== userId) return;
  verifiedRegistrationId = null;
  try {
    window.sessionStorage.removeItem(REGISTRATION_ONBOARDING_KEY);
  } catch {
    // The in-memory marker has already been consumed.
  }
  openAuthDialog({ mode: "language-preferences", userId });
}

export function notifyLanguagePreferencesChanged(): void {
  window.dispatchEvent(new Event(LANGUAGE_PREFERENCES_CHANGED_EVENT));
}
