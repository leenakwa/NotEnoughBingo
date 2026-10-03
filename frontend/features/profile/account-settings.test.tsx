import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSettings } from "@/features/profile/account-settings";
import {
  clearProfileEdits,
  readProfileEdits,
  rememberProfileEdits,
} from "@/features/profile/profile-edit-cache";
import type { AuthenticatedUser, NotificationPreferences, UserProfile } from "@/lib/api/types";
import { AUTH_SIGNED_IN_EVENT } from "@/lib/auth-events";
import { uploadImage } from "@/lib/uploads";

const mocks = vi.hoisted(() => ({
  cancelAccountDeletion: vi.fn(),
  me: vi.fn(),
  notificationPreferences: vi.fn(),
  notifyAuthChanged: vi.fn(),
  notifySignedOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  scheduleAccountDeletion: vi.fn(),
  sessions: vi.fn(),
  changePassword: vi.fn(),
  requestEmailChange: vi.fn(),
  updateProfile: vi.fn(),
  updatePreferences: vi.fn(),
  requestExport: vi.fn(),
  getExport: vi.fn(),
  logout: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock("@/lib/auth-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-events")>()),
  notifyAuthChanged: mocks.notifyAuthChanged,
  notifySignedOut: mocks.notifySignedOut,
}));

vi.mock("@/lib/uploads", () => ({
  uploadImage: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  api: {
    auth: {
      cancelAccountDeletion: mocks.cancelAccountDeletion,
      me: mocks.me,
      scheduleAccountDeletion: mocks.scheduleAccountDeletion,
      sessions: mocks.sessions,
      changePassword: mocks.changePassword,
      requestEmailChange: mocks.requestEmailChange,
      requestAccountExport: mocks.requestExport,
      logout: mocks.logout,
      revokeSession: mocks.revokeSession,
    },
    exports: { get: mocks.getExport },
    profiles: {
      update: mocks.updateProfile,
      updateNotificationPreferences: mocks.updatePreferences,
      notificationPreferences: mocks.notificationPreferences,
    },
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
  fieldValidationMessage: () => null,
}));

const currentUser: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "creator",
  display_name: "Creator",
  avatar: null,
  email: "creator@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};

const profile: UserProfile = {
  id: currentUser.id,
  username: currentUser.username,
  display_name: currentUser.display_name,
  avatar: null,
  bio: "",
  follower_count: 0,
  following_count: 0,
  is_following: false,
  privacy: {
    show_bio: true,
    show_created_bingos: true,
    show_play_history: true,
    show_shared_results: true,
    show_followers: true,
    show_following: true,
  },
};

const preferences: NotificationPreferences = {
  new_comment: true,
  comment_reply: true,
  bingo_like: true,
  comment_like: true,
  new_follower: true,
  marketing_email: false,
};

describe("AccountSettings deletion grace period", () => {
  beforeEach(() => {
    clearProfileEdits();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(uploadImage).mockReset();
    mocks.me.mockResolvedValue(currentUser);
    mocks.sessions.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mocks.notificationPreferences.mockResolvedValue(preferences);
    mocks.cancelAccountDeletion.mockResolvedValue(undefined);
  });

  it.each([
    ["Active sessions", "sessions", "Notification preferences"],
    ["Notification preferences", "notificationPreferences", "Active sessions"],
  ] as const)(
    "keeps other settings usable when %s fails and retries only that section",
    async (heading, request, otherHeading) => {
      mocks[request].mockRejectedValueOnce(new Error("This section is temporarily unavailable."));
      const user = userEvent.setup();
      render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
      expect(await screen.findByRole("button", { name: "Change password" })).toBeEnabled();
      const section = screen.getByRole("heading", { name: heading }).closest(".settings-card")!;
      const other = screen.getByRole("heading", { name: otherHeading }).closest(".settings-card")!;
      expect(within(section as HTMLElement).getByRole("alert")).toHaveTextContent(
        "This section is temporarily unavailable.",
      );
      expect(within(other as HTMLElement).queryByRole("alert")).not.toBeInTheDocument();
      await user.click(within(section as HTMLElement).getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(within(section as HTMLElement).queryByRole("alert")).toBeNull());
      expect(mocks[request]).toHaveBeenCalledTimes(2);
      expect(mocks.me).toHaveBeenCalledTimes(1);
      expect(
        mocks[request === "sessions" ? "notificationPreferences" : "sessions"],
      ).toHaveBeenCalledTimes(1);
    },
  );

  it("does not wait for a slow preferences request before showing security controls", async () => {
    let resolve: (value: NotificationPreferences) => void = () => undefined;
    mocks.notificationPreferences.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Change password" })).toBeEnabled();
    expect(screen.getByText("Loading notification preferences…")).toBeVisible();
    expect(screen.queryByLabelText("Optional product email")).not.toBeInTheDocument();
    resolve(preferences);
    expect(await screen.findByLabelText("Optional product email")).not.toBeChecked();
  });

  it("does not expose account controls when the authenticated identity request fails", async () => {
    mocks.me.mockRejectedValueOnce(new Error("Your session has expired."));
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your session has expired.");
    expect(screen.queryByRole("button", { name: "Change password" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Optional product email")).not.toBeInTheDocument();
  });

  it("keeps successful password feedback when the subsequent sessions refresh fails", async () => {
    mocks.sessions.mockResolvedValueOnce({ count: 0, next: null, previous: null, results: [] });
    mocks.sessions.mockRejectedValueOnce(new Error("Sessions temporarily unavailable."));
    mocks.changePassword.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const current = await screen.findByLabelText("Current password", { exact: true });
    await user.type(current, "example value");
    await user.type(screen.getByLabelText("New password", { exact: true }), "new example value");
    await user.type(
      screen.getByLabelText("Confirm new password", { exact: true }),
      "new example value",
    );
    const submit = screen.getByRole("button", { name: "Change password" });
    await user.click(submit);
    await waitFor(() => expect(mocks.sessions).toHaveBeenCalledTimes(2));
    const form = submit.closest("form")!;
    expect(within(form).getByRole("status")).toHaveTextContent("Password changed.");
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument();
    expect(current).toHaveValue("");
    expect(screen.getByRole("alert").closest(".settings-card")).toHaveTextContent(
      "Active sessions",
    );
    expect(mocks.changePassword).toHaveBeenCalledOnce();
  });

  it("restores a pending schedule after re-authentication and lets the user cancel it", async () => {
    const user = userEvent.setup();
    mocks.me.mockResolvedValue({
      ...currentUser,
      deletion_scheduled_for: "2026-08-21T12:00:00Z",
    });
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Cancel deletion" }));

    await waitFor(() => expect(mocks.cancelAccountDeletion).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Schedule account deletion" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Account deletion cancelled.");
  });

  it("lets the user cancel an avatar upload without changing the profile", async () => {
    const user = userEvent.setup();
    const onProfileChange = vi.fn();
    vi.mocked(uploadImage).mockImplementation(
      (_file, _kind, options) =>
        new Promise((_resolve, reject) => {
          options?.onPhase?.("uploading");
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Upload cancelled.", "AbortError")),
          );
        }),
    );
    render(<AccountSettings profile={profile} onProfileChange={onProfileChange} />);
    await screen.findByText("Upload avatar");
    fireEvent.change(screen.getByLabelText("Upload avatar"), {
      target: { files: [new File(["image"], "avatar.png", { type: "image/png" })] },
    });
    await screen.findByText("Uploading image…");

    await user.click(screen.getByRole("button", { name: "Cancel upload" }));

    expect(await screen.findByText("Upload cancelled.")).toBeVisible();
    expect(onProfileChange).not.toHaveBeenCalled();
  });

  it("routes through an explanatory login screen after scheduling revokes sessions", async () => {
    const user = userEvent.setup();
    rememberProfileEdits(currentUser.id, { bio: "Unsaved private profile text" });
    expect(readProfileEdits("another-account")).toBeUndefined();
    mocks.scheduleAccountDeletion.mockResolvedValue({
      request_id: "22222222-2222-4222-8222-222222222222",
      status: "scheduled",
      scheduled_for: "2026-08-21T12:00:00Z",
    });
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);

    await user.type(await screen.findByLabelText("Confirm with your password"), "secret password");
    await user.click(screen.getByRole("button", { name: "Schedule account deletion" }));

    await waitFor(() =>
      expect(mocks.scheduleAccountDeletion).toHaveBeenCalledWith("secret password"),
    );
    expect(mocks.notifySignedOut).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/login?next=%2Fprofile&reason=deletion-scheduled");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(readProfileEdits(currentUser.id)).toBeUndefined();
  });

  it("submits actual filled password values and retains them on failure", async () => {
    mocks.changePassword.mockRejectedValue(new Error("Test submission rejected."));
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const current = (await screen.findByLabelText("Current password", {
      exact: true,
    })) as HTMLInputElement;
    const next = screen.getByLabelText("New password", { exact: true }) as HTMLInputElement;
    const confirm = screen.getByLabelText("Confirm new password", {
      exact: true,
    }) as HTMLInputElement;
    current.value = "filled current synthetic password";
    next.value = confirm.value = "filled new synthetic password";
    fireEvent.submit(current.closest("form")!);
    await waitFor(() =>
      expect(mocks.changePassword).toHaveBeenCalledWith({
        current_password: "filled current synthetic password",
        new_password: "filled new synthetic password",
      }),
    );
    await screen.findByRole("alert");
    expect(current).toHaveValue("filled current synthetic password");
    expect(next).toHaveValue("filled new synthetic password");
  });

  it("compares actual filled password confirmation before making a request", async () => {
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const current = (await screen.findByLabelText("Current password", {
      exact: true,
    })) as HTMLInputElement;
    current.value = "filled current synthetic password";
    (screen.getByLabelText("New password", { exact: true }) as HTMLInputElement).value =
      "filled new synthetic password";
    const confirmation = screen.getByLabelText("Confirm new password", {
      exact: true,
    }) as HTMLInputElement;
    confirmation.value = "different filled synthetic password";
    fireEvent.submit(current.closest("form")!);
    expect(mocks.changePassword).not.toHaveBeenCalled();
    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveValue("different filled synthetic password");
    expect(confirmation).toHaveAccessibleDescription("The new passwords do not match.");
  });

  it("submits actual filled email-change values and retains them on failure", async () => {
    mocks.requestEmailChange.mockRejectedValue(new Error("Test submission rejected."));
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const email = (await screen.findByLabelText("New email address")) as HTMLInputElement;
    const password = screen.getByLabelText("Current password for email change") as HTMLInputElement;
    email.value = "filled@example.test";
    password.value = "filled current synthetic password";
    fireEvent.submit(email.closest("form")!);
    await waitFor(() =>
      expect(mocks.requestEmailChange).toHaveBeenCalledWith({
        new_email: "filled@example.test",
        current_password: "filled current synthetic password",
      }),
    );
    await screen.findByRole("alert");
    expect(email).toHaveValue("filled@example.test");
    expect(password).toHaveValue("filled current synthetic password");
  });

  it("reads the actual filled deletion confirmation password", async () => {
    mocks.scheduleAccountDeletion.mockRejectedValue(new Error("Test submission rejected."));
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const password = (await screen.findByLabelText(
      "Confirm with your password",
    )) as HTMLInputElement;
    password.value = "filled deletion synthetic password";
    fireEvent.submit(password.closest("form")!);
    await waitFor(() =>
      expect(mocks.scheduleAccountDeletion).toHaveBeenCalledWith(
        "filled deletion synthetic password",
      ),
    );
    await screen.findByRole("alert");
    expect(password).toHaveValue("filled deletion synthetic password");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("focuses mismatched confirmation and keeps the error beside that field", async () => {
    const user = userEvent.setup();
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    await user.type(
      await screen.findByLabelText("Current password", { exact: true }),
      "example value",
    );
    await user.type(screen.getByLabelText("New password", { exact: true }), "new example value");
    const confirmation = screen.getByLabelText("Confirm new password", { exact: true });
    await user.type(confirmation, "different example value");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(confirmation).toHaveFocus();
    expect(confirmation).toHaveAttribute("aria-invalid", "true");
    expect(confirmation).toHaveAccessibleDescription("The new passwords do not match.");
    expect(mocks.changePassword).not.toHaveBeenCalled();
    await user.type(confirmation, "x");
    expect(confirmation).not.toHaveAttribute("aria-invalid");
  });

  it("keeps a failed password form intact, shows its error locally, and allows retry", async () => {
    const user = userEvent.setup();
    mocks.changePassword.mockRejectedValueOnce(new Error("Current password is incorrect."));
    mocks.changePassword.mockResolvedValueOnce(undefined);
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const current = await screen.findByLabelText("Current password", { exact: true });
    await user.type(current, "example value");
    await user.type(screen.getByLabelText("New password", { exact: true }), "new example value");
    await user.type(
      screen.getByLabelText("Confirm new password", { exact: true }),
      "new example value",
    );
    const submit = screen.getByRole("button", { name: "Change password" });
    await user.click(submit);

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Current password is incorrect.");
    expect(error.closest("form")).toBe(submit.closest("form"));
    expect(current).toHaveValue("example value");
    await user.click(submit);
    expect(
      await screen.findByText("Password changed. Other sessions were signed out."),
    ).toBeVisible();
    expect(current).toHaveValue("");
    expect(mocks.changePassword).toHaveBeenCalledTimes(2);
  });

  it("does not attach an avatar when its upload completes after departure", async () => {
    let resolveUpload!: (asset: Awaited<ReturnType<typeof uploadImage>>) => void;
    vi.mocked(uploadImage).mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    mocks.updateProfile.mockResolvedValue(profile);
    const changed = vi.fn();
    const view = render(<AccountSettings profile={profile} onProfileChange={changed} />);
    const input = await screen.findByLabelText("Upload avatar");
    fireEvent.change(input, {
      target: { files: [new File(["image"], "avatar.png", { type: "image/png" })] },
    });
    view.unmount();
    await act(async () =>
      resolveUpload({
        id: "avatar",
        kind: "avatar",
        status: "ready",
        url: null,
        mime_type: "image/png",
      }),
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(mocks.notifyAuthChanged).not.toHaveBeenCalled();
  });

  it("does not apply a completed avatar save to the next profile", async () => {
    let resolveSave!: (value: UserProfile) => void;
    const avatar = {
      id: "avatar",
      kind: "avatar" as const,
      status: "ready" as const,
      url: null,
      mime_type: "image/png",
    };
    vi.mocked(uploadImage).mockResolvedValue(avatar);
    mocks.updateProfile.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const changed = vi.fn();
    const view = render(<AccountSettings profile={profile} onProfileChange={changed} />);
    fireEvent.change(await screen.findByLabelText("Upload avatar"), {
      target: { files: [new File(["image"], "avatar.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledOnce());
    const next = { ...profile, id: "22222222-2222-4222-8222-222222222222", username: "next" };
    mocks.me.mockResolvedValue({ ...currentUser, ...next });
    view.rerender(<AccountSettings profile={next} onProfileChange={changed} />);
    await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(2));
    mocks.requestExport.mockReturnValue(new Promise(() => {}));
    fireEvent.click(await screen.findByRole("button", { name: "Request data export" }));
    await act(async () => resolveSave({ ...profile, avatar }));
    expect(changed).not.toHaveBeenCalled();
    expect(mocks.notifyAuthChanged).not.toHaveBeenCalled();
    expect(screen.queryByText("Avatar updated.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Upload avatar")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Preparing export…" })).toBeDisabled();
  });

  it("does not start private export reads after the requester leaves", async () => {
    let resolveRequest!: (value: { job_id: string }) => void;
    mocks.requestExport.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    mocks.getExport.mockResolvedValue({ status: "ready" });
    const view = render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Request data export" }));
    view.unmount();
    await act(async () => resolveRequest({ job_id: "export-job" }));
    expect(mocks.getExport).not.toHaveBeenCalled();
  });

  it("stops export polling when the page leaves during its timer", async () => {
    mocks.requestExport.mockResolvedValue({ job_id: "export-job" });
    mocks.getExport.mockResolvedValue({ status: "queued" });
    const view = render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Request data export" });
    vi.useFakeTimers();
    try {
      await act(async () => fireEvent.click(button));
      expect(mocks.getExport).toHaveBeenCalledOnce();
      view.unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(mocks.getExport).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a preference rollback after an account refresh", async () => {
    let rejectSave!: (error: Error) => void;
    mocks.updatePreferences.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    fireEvent.click(await screen.findByLabelText("Optional product email"));
    mocks.notificationPreferences.mockResolvedValue({ ...preferences, marketing_email: true });
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT));
    });
    await waitFor(() => expect(mocks.notificationPreferences).toHaveBeenCalledTimes(2));
    await act(async () => rejectSave(new Error("Old preference failure")));
    expect(screen.getByLabelText("Optional product email")).toBeChecked();
    expect(screen.queryByText("Old preference failure")).not.toBeInTheDocument();
  });

  it("keeps new credentials and sessions after an obsolete password success", async () => {
    let resolveSave!: () => void;
    mocks.changePassword.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const current = await screen.findByLabelText("Current password", { exact: true });
    fireEvent.change(current, { target: { value: "current example" } });
    fireEvent.change(screen.getByLabelText("New password", { exact: true }), {
      target: { value: "new example" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password", { exact: true }), {
      target: { value: "new example" },
    });
    fireEvent.submit(current.closest("form")!);
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT));
    });
    await waitFor(() => expect(mocks.sessions).toHaveBeenCalledTimes(2));
    fireEvent.change(await screen.findByLabelText("Current password", { exact: true }), {
      target: { value: "next account example" },
    });
    await act(async () => resolveSave());
    expect(mocks.sessions).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Current password", { exact: true })).toHaveValue(
      "next account example",
    );
  });

  it("clears credential fields on account refresh and ignores an old email response", async () => {
    let resolveSave!: () => void;
    mocks.requestEmailChange.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const email = await screen.findByLabelText("New email address", { exact: true });
    fireEvent.change(email, { target: { value: "next@example.test" } });
    fireEvent.change(screen.getByLabelText("Current password for email change"), {
      target: { value: "current example" },
    });
    fireEvent.submit(email.closest("form")!);
    await act(async () => {
      window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT));
    });
    expect(await screen.findByLabelText("Current password for email change")).toHaveValue("");
    await act(async () => resolveSave());
    expect(
      screen.queryByText(/Check the new email address for a confirmation link/),
    ).not.toBeInTheDocument();
  });

  it.each(["logout", "revokeSession", "scheduleAccountDeletion"] as const)(
    "does not redirect the next scope after a late %s response",
    async (action) => {
      let resolveAction!: (value?: unknown) => void;
      mocks[action].mockReturnValue(
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
      );
      mocks.sessions.mockResolvedValue({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: "current",
            current: true,
            user_agent: "Test browser",
            last_seen_at: "2026-10-01T00:00:00Z",
          },
        ],
      });
      const view = render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
      await screen.findByRole("button", { name: "Log out" });
      if (action === "scheduleAccountDeletion") {
        const password = screen.getByLabelText("Confirm with your password");
        fireEvent.change(password, { target: { value: "current example" } });
        fireEvent.submit(password.closest("form")!);
      } else
        fireEvent.click(
          await screen.findByRole("button", {
            name: action === "logout" ? "Log out" : "Sign out",
          }),
        );
      view.unmount();
      await act(async () => resolveAction({ scheduled_for: "2026-11-01T00:00:00Z" }));
      expect(mocks.notifySignedOut).not.toHaveBeenCalled();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it("keeps export polling and download feedback for the active requester", async () => {
    mocks.requestExport.mockResolvedValue({ job_id: "export-job" });
    mocks.getExport.mockResolvedValueOnce({ status: "queued" });
    mocks.getExport.mockResolvedValueOnce({
      status: "ready",
      download_url: "/api/v1/exports/export-job/download/",
    });
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const button = await screen.findByRole("button", { name: "Request data export" });
    vi.useFakeTimers();
    try {
      await act(async () => fireEvent.click(button));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(mocks.getExport).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Your data export is ready to download.")).toBeVisible();
      expect(screen.getByRole("link", { name: "Download data export" })).toHaveAttribute(
        "href",
        "/api/v1/exports/export-job/download/",
      );
      expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("withholds private controls when the session identity no longer matches the profile", async () => {
    mocks.me.mockResolvedValue({ ...currentUser, id: "22222222-2222-4222-8222-222222222222" });
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Your account changed.");
    expect(screen.queryByLabelText("Current password", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });
});
