import { beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_DIALOG_EVENT } from "@/lib/auth-events";

describe("registration language onboarding", () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it("opens only for the verified account, once, after login", async () => {
    const { markRegistrationVerified, openRegistrationOnboarding } =
      await import("./registration-onboarding");
    const opened = vi.fn();
    window.addEventListener(AUTH_DIALOG_EVENT, opened);
    try {
      openRegistrationOnboarding("existing-user");
      expect(opened).not.toHaveBeenCalled();
      markRegistrationVerified("new-user");
      openRegistrationOnboarding("different-user");
      expect(opened).not.toHaveBeenCalled();
      openRegistrationOnboarding("new-user");
      expect(opened).toHaveBeenCalledOnce();
      expect((opened.mock.calls[0]![0] as CustomEvent).detail).toEqual({
        mode: "language-preferences",
        userId: "new-user",
      });
      openRegistrationOnboarding("new-user");
      expect(opened).toHaveBeenCalledOnce();
      expect(window.sessionStorage.length).toBe(0);
    } finally {
      window.removeEventListener(AUTH_DIALOG_EVENT, opened);
    }
  });

  it("keeps the verification marker across a reload", async () => {
    const { markRegistrationVerified } = await import("./registration-onboarding");
    markRegistrationVerified("new-user");
    vi.resetModules();
    const { openRegistrationOnboarding } = await import("./registration-onboarding");
    const opened = vi.fn();
    window.addEventListener(AUTH_DIALOG_EVENT, opened);
    try {
      openRegistrationOnboarding("new-user");
      expect(opened).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(AUTH_DIALOG_EVENT, opened);
    }
  });

  it("uses the current flow without storage and still opens only once", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    const { markRegistrationVerified, openRegistrationOnboarding } =
      await import("./registration-onboarding");
    const opened = vi.fn();
    window.addEventListener(AUTH_DIALOG_EVENT, opened);
    try {
      markRegistrationVerified("new-user");
      openRegistrationOnboarding("new-user");
      openRegistrationOnboarding("new-user");
      expect(opened).toHaveBeenCalledOnce();
    } finally {
      storage.mockRestore();
      window.removeEventListener(AUTH_DIALOG_EVENT, opened);
    }
  });
});
