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
import { uploadImage, type UploadOptions } from "@/lib/uploads";

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
  fieldValidationMessage: vi.fn(),
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
  fieldValidationMessage: mocks.fieldValidationMessage,
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

const credentialForms = {
  email: {
    request: "requestEmailChange",
    fields: [
      ["New email address", "next@example.test"],
      ["Current password for email change", "synthetic current password"],
    ],
  },
  password: {
    request: "changePassword",
    fields: [
      ["Current password", "synthetic current password"],
      ["New password", "synthetic new password"],
      ["Confirm new password", "synthetic new password"],
    ],
  },
  deletion: {
    request: "scheduleAccountDeletion",
    fields: [["Confirm with your password", "synthetic current password"]],
  },
} as const;

function fillCredentialForm(action: keyof typeof credentialForms) {
  const fields = credentialForms[action].fields.map(([label, value]) => {
    const input = screen.getByLabelText(label, { exact: true });
    fireEvent.change(input, { target: { value } });
    return { input, value };
  });
  const form = fields[0]?.input.closest("form");
  if (!form) throw new Error("The credential fields must belong to a form.");
  return { fields, form };
}

describe("AccountSettings deletion grace period", () => {
  beforeEach(() => {
    clearProfileEdits();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.fieldValidationMessage.mockReset().mockReturnValue(null);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(uploadImage).mockReset();
    mocks.me.mockResolvedValue(currentUser);
    mocks.sessions.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mocks.notificationPreferences.mockResolvedValue(preferences);
    mocks.cancelAccountDeletion.mockResolvedValue(undefined);
  });

  it.each(["email", "password", "deletion"] as const)(
    "locks the %s form while saving so late typing cannot be discarded by success",
    async (action) => {
      let resolveSave!: (value?: unknown) => void;
      const request = mocks[credentialForms[action].request];
      request.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
      );
      const user = userEvent.setup();
      render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
      await screen.findByRole("button", { name: "Change password" });
      const { fields, form } = fillCredentialForm(action);
      const toggles = within(form).getAllByRole("button", { name: "Show" });
      fireEvent.submit(form);

      if (action === "deletion") {
        expect(within(form).getByRole("button", { name: "Scheduling…" })).toBeDisabled();
        expect(within(form).queryByText("Cancelling account deletion…")).not.toBeInTheDocument();
      }
      for (const { input, value } of fields) {
        expect(input).toBeDisabled();
        await user.type(input, "late typing");
        expect(input).toHaveValue(value);
      }
      for (const toggle of toggles) {
        expect(toggle).toBeDisabled();
        await user.click(toggle);
      }
      expect(form.querySelector('input[type="text"]')).toBeNull();
      expect(screen.getByLabelText("Current password", { exact: true })).toBeDisabled();
      expect(screen.getByLabelText("New email address")).toBeDisabled();
      expect(screen.getByLabelText("Confirm with your password")).toBeDisabled();
      fireEvent.submit(form);
      expect(request).toHaveBeenCalledOnce();

      await act(async () =>
        resolveSave(action === "deletion" ? { scheduled_for: "2026-11-01T00:00:00Z" } : undefined),
      );
      if (action === "deletion") {
        expect(screen.queryByLabelText("Confirm with your password")).not.toBeInTheDocument();
        expect(mocks.replace).toHaveBeenCalledWith(
          "/login?next=%2Fprofile&reason=deletion-scheduled",
        );
      } else {
        for (const [index, { input }] of fields.entries()) {
          expect(input).toBeEnabled();
          expect(input).toHaveValue(action === "email" && index === 0 ? "next@example.test" : "");
        }
        expect(within(form).getByRole("status")).toHaveTextContent(
          action === "email" ? "Check the new email address" : "Password changed.",
        );
      }
    },
  );

  it.each([
    ["password", "current_password", "Current password"],
    ["password", "new_password", "New password"],
    ["email", "new_email", "New email address"],
    ["email", "current_password", "Current password for email change"],
    ["deletion", "password", "Confirm with your password"],
  ] as const)(
    "associates the rejected %s %s field and focuses it after the form is enabled",
    async (action, apiField, label) => {
      let rejectSave!: (error: Error) => void;
      const request = mocks[credentialForms[action].request];
      request.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectSave = reject;
        }),
      );
      const fieldError = "The submitted value is incorrect.";
      mocks.fieldValidationMessage.mockImplementation((_caught, field) =>
        field === apiField ? fieldError : null,
      );
      render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
      await screen.findByRole("button", { name: "Change password" });
      const { fields, form } = fillCredentialForm(action);
      const rejected = screen.getByLabelText(label, { exact: true });
      (form.querySelector('button[type="submit"]') as HTMLButtonElement).focus();
      fireEvent.submit(form);
      expect(rejected).toBeDisabled();
      await act(async () => rejectSave(new Error("Validation failed")));

      expect(rejected).toBeEnabled();
      expect(rejected).toHaveFocus();
      expect(rejected).toHaveAttribute("aria-invalid", "true");
      expect(rejected).toHaveAccessibleDescription(/The submitted value is incorrect\./);
      expect(within(form).getByRole("alert")).toHaveTextContent(fieldError);
      for (const { input, value } of fields) {
        expect(input).toHaveValue(value);
      }
      fireEvent.change(rejected, { target: { value: "corrected synthetic value" } });
      expect(rejected).not.toHaveAttribute("aria-invalid", "true");
      expect(within(form).queryByText(fieldError)).not.toBeInTheDocument();
      expect(mocks.replace).not.toHaveBeenCalled();
    },
  );

  it("explains the established password requirements beside the new password", async () => {
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const password = await screen.findByLabelText("New password", { exact: true });
    expect(password).toHaveAttribute("minlength", "12");
    expect(password).toHaveAccessibleDescription(
      "Use at least 12 characters. Avoid common words and your username.",
    );
    expect(
      screen.getByText("Use at least 12 characters. Avoid common words and your username."),
    ).toBeVisible();
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

  it.each([
    ["another device", false],
    ["this device", true],
  ] as const)(
    "shows scoped progress and allows retry after signing out %s fails",
    async (_device, current) => {
      let rejectSignOut!: (reason: unknown) => void;
      const targetId = "44444444-4444-4444-8444-444444444444";
      mocks.revokeSession
        .mockReset()
        .mockReturnValueOnce(
          new Promise((_resolve, reject) => {
            rejectSignOut = reject;
          }),
        )
        .mockResolvedValueOnce(undefined);
      mocks.sessions.mockResolvedValue({
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            id: targetId,
            current,
            user_agent: "Target browser",
            last_seen_at: "2026-10-01T00:00:00Z",
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            current: !current,
            user_agent: "Other browser",
            last_seen_at: "2026-10-01T00:00:00Z",
          },
        ],
      });
      mocks.me.mockResolvedValue({
        ...currentUser,
        deletion_scheduled_for: "2026-11-01T00:00:00Z",
      });
      const user = userEvent.setup();
      render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
      const targetRow = (await screen.findByText("Target browser")).closest("li")!;
      const otherRow = screen.getByText("Other browser").closest("li")!;
      const sessionsCard = targetRow.closest(".settings-card");
      if (!(sessionsCard instanceof HTMLDivElement)) {
        throw new Error("Active sessions must have their own settings card.");
      }
      const cancelDeletion = await screen.findByRole("button", { name: "Cancel deletion" });
      const deletionForm = cancelDeletion.closest("form")!;
      const { fields } = fillCredentialForm("email");

      await user.click(within(targetRow).getByRole("button", { name: "Sign out" }));

      const signingOut = within(targetRow).getByRole("button", { name: "Signing out…" });
      expect(signingOut).toBeDisabled();
      expect(within(otherRow).getByRole("button", { name: "Sign out" })).toBeDisabled();
      expect(within(sessionsCard).getByRole("status")).toHaveTextContent("Signing out session…");
      expect(cancelDeletion).toHaveAccessibleName("Cancel deletion");
      expect(within(deletionForm).queryByRole("status")).not.toBeInTheDocument();
      await user.click(signingOut);
      await user.click(within(otherRow).getByRole("button", { name: "Sign out" }));
      expect(mocks.revokeSession).toHaveBeenCalledOnce();
      expect(mocks.revokeSession).toHaveBeenCalledWith(targetId);

      await act(async () => rejectSignOut(new Error("Session could not be signed out.")));

      expect(within(sessionsCard).getByRole("alert")).toHaveTextContent(
        "Session could not be signed out.",
      );
      expect(within(sessionsCard).queryByRole("status")).not.toBeInTheDocument();
      expect(within(targetRow).getByRole("button", { name: "Sign out" })).toBeEnabled();
      expect(within(otherRow).getByRole("button", { name: "Sign out" })).toBeEnabled();
      expect(within(deletionForm).queryByRole("alert")).not.toBeInTheDocument();
      for (const { input, value } of fields) expect(input).toHaveValue(value);
      expect(mocks.notifySignedOut).not.toHaveBeenCalled();

      await user.click(within(targetRow).getByRole("button", { name: "Sign out" }));

      expect(mocks.revokeSession).toHaveBeenCalledTimes(2);
      if (current) {
        expect(mocks.notifySignedOut).toHaveBeenCalledOnce();
        expect(mocks.replace).toHaveBeenCalledWith("/login");
        expect(mocks.refresh).toHaveBeenCalledOnce();
      } else {
        expect(screen.queryByText("Target browser")).not.toBeInTheDocument();
        expect(screen.getByText("Other browser")).toBeVisible();
        expect(within(sessionsCard).getByRole("status")).toHaveTextContent("Session signed out.");
        for (const { input, value } of fields) expect(input).toHaveValue(value);
        expect(mocks.notifySignedOut).not.toHaveBeenCalled();
      }
    },
  );

  it("shows cancellation progress and keeps the scheduled deletion and other drafts after failure", async () => {
    let rejectCancellation!: (reason: unknown) => void;
    const scheduledFor = "2026-11-01T00:00:00Z";
    mocks.me.mockResolvedValue({ ...currentUser, deletion_scheduled_for: scheduledFor });
    mocks.cancelAccountDeletion
      .mockReset()
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectCancellation = reject;
        }),
      )
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
    const cancel = await screen.findByRole("button", { name: "Cancel deletion" });
    const form = cancel.closest("form")!;
    const { fields } = fillCredentialForm("email");

    await user.click(cancel);

    const cancelling = within(form).getByRole("button", { name: "Cancelling deletion…" });
    expect(cancelling).toBeDisabled();
    expect(within(form).getByRole("status")).toHaveTextContent("Cancelling account deletion…");
    expect(form.querySelector("time")).toHaveAttribute("dateTime", scheduledFor);
    await user.click(cancelling);
    fireEvent.submit(form);
    expect(mocks.cancelAccountDeletion).toHaveBeenCalledOnce();
    expect(mocks.scheduleAccountDeletion).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();

    await act(async () => rejectCancellation(new Error("Deletion cancellation failed.")));

    expect(within(form).getByRole("alert")).toHaveTextContent("Deletion cancellation failed.");
    expect(within(form).queryByRole("status")).not.toBeInTheDocument();
    expect(form.querySelector("time")).toHaveAttribute("dateTime", scheduledFor);
    expect(within(form).getByRole("button", { name: "Cancel deletion" })).toBeEnabled();
    for (const { input, value } of fields) expect(input).toHaveValue(value);
    expect(screen.getAllByRole("alert")).toHaveLength(1);

    await user.click(within(form).getByRole("button", { name: "Cancel deletion" }));

    expect(mocks.cancelAccountDeletion).toHaveBeenCalledTimes(2);
    expect(form.querySelector("time")).toBeNull();
    expect(within(form).queryByRole("button", { name: "Cancel deletion" })).not.toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Schedule account deletion" })).toBeEnabled();
    expect(within(form).getByRole("status")).toHaveTextContent("Account deletion cancelled.");
    for (const { input, value } of fields) expect(input).toHaveValue(value);
  });

  it("lets the user cancel an avatar upload without changing the profile", async () => {
    const user = userEvent.setup();
    const onProfileChange = vi.fn();
    let uploadOptions: UploadOptions | undefined;
    vi.mocked(uploadImage).mockImplementation(
      (_file, _kind, options) =>
        new Promise((_resolve, reject) => {
          uploadOptions = options;
          options?.onPhase?.("uploading");
          options?.onProgress?.({ loaded: 200, total: 400 });
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
    await screen.findByText("Uploading image… 50%");

    await user.click(screen.getByRole("button", { name: "Cancel upload" }));

    expect(await screen.findByText("Upload cancelled.")).toBeVisible();
    act(() => {
      uploadOptions?.onPhase?.("uploading");
      uploadOptions?.onProgress?.({ loaded: 400, total: 400 });
    });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(onProfileChange).not.toHaveBeenCalled();
  });

  it("keeps avatar processing indeterminate after byte transfer and clears progress on completion", async () => {
    let uploadOptions: UploadOptions | undefined;
    let resolveUpload!: (asset: Awaited<ReturnType<typeof uploadImage>>) => void;
    vi.mocked(uploadImage).mockImplementationOnce((_file, _kind, options) => {
      uploadOptions = options;
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    });
    const avatar = {
      id: "avatar",
      kind: "avatar" as const,
      status: "ready" as const,
      url: "/api/v1/media/avatar/",
      mime_type: "image/png",
    };
    mocks.updateProfile.mockResolvedValue({ ...profile, avatar });
    const changed = vi.fn();
    render(<AccountSettings profile={profile} onProfileChange={changed} />);
    fireEvent.change(await screen.findByLabelText("Upload avatar"), {
      target: { files: [new File(["image"], "avatar.png", { type: "image/png" })] },
    });
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
    act(() => {
      uploadOptions?.onPhase?.("uploading");
      uploadOptions?.onProgress?.({ loaded: 400, total: 400 });
    });
    expect(screen.getByRole("progressbar", { name: "Uploading image…" })).toHaveAttribute(
      "value",
      "100",
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    act(() => uploadOptions?.onPhase?.("processing"));
    expect(screen.getByRole("progressbar", { name: "Processing image…" })).not.toHaveAttribute(
      "value",
    );
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    await act(async () => resolveUpload(avatar));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(changed).toHaveBeenCalledWith({ ...profile, avatar });
    act(() => uploadOptions?.onProgress?.({ loaded: 100, total: 400 }));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("isolates old avatar progress and completion after the profile identity changes", async () => {
    let oldOptions: UploadOptions | undefined;
    let nextOptions: UploadOptions | undefined;
    let resolveOldUpload!: (asset: Awaited<ReturnType<typeof uploadImage>>) => void;
    let resolveNextUpload!: (asset: Awaited<ReturnType<typeof uploadImage>>) => void;
    vi.mocked(uploadImage)
      .mockImplementationOnce((_file, _kind, options) => {
        oldOptions = options;
        return new Promise((resolve) => {
          resolveOldUpload = resolve;
        });
      })
      .mockImplementationOnce((_file, _kind, options) => {
        nextOptions = options;
        return new Promise((resolve) => {
          resolveNextUpload = resolve;
        });
      });
    const avatar = {
      id: "next-avatar",
      kind: "avatar" as const,
      status: "ready" as const,
      url: "/api/v1/media/next-avatar/",
      mime_type: "image/png",
    };
    const changed = vi.fn();
    const view = render(<AccountSettings profile={profile} onProfileChange={changed} />);
    const selectFile = (input: HTMLElement) =>
      fireEvent.change(input, {
        target: { files: [new File(["image"], "avatar.png", { type: "image/png" })] },
      });
    selectFile(await screen.findByLabelText("Upload avatar"));
    act(() => {
      oldOptions?.onPhase?.("uploading");
      oldOptions?.onProgress?.({ loaded: 300, total: 400 });
    });
    expect(screen.getByText("Uploading image… 75%")).toBeVisible();
    const next = { ...profile, id: "22222222-2222-4222-8222-222222222222", username: "next" };
    mocks.me.mockResolvedValue({ ...currentUser, ...next });
    mocks.updateProfile.mockResolvedValue({ ...next, avatar });
    view.rerender(<AccountSettings profile={next} onProfileChange={changed} />);
    await waitFor(() => expect(screen.getByLabelText("Upload avatar")).toBeEnabled());
    expect(oldOptions?.signal?.aborted).toBe(true);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    selectFile(screen.getByLabelText("Upload avatar"));
    act(() => {
      nextOptions?.onPhase?.("uploading");
      nextOptions?.onProgress?.({ loaded: 100, total: 400 });
      oldOptions?.onPhase?.("processing");
      oldOptions?.onProgress?.({ loaded: 400, total: 400 });
    });
    await act(async () => resolveOldUpload(avatar));
    expect(screen.getByText("Uploading image… 25%")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel upload" })).toBeEnabled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    await act(async () => resolveNextUpload(avatar));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(changed).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith({ ...next, avatar });
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

  it.each(["success", "failure"] as const)(
    "restores the initiating notification checkbox after disabled-input focus loss on %s",
    async (outcome) => {
      let resolveSave!: (value: NotificationPreferences) => void;
      let rejectSave!: (error: Error) => void;
      mocks.updatePreferences.mockReturnValueOnce(
        new Promise((resolve, reject) => {
          resolveSave = resolve;
          rejectSave = reject;
        }),
      );
      vi.spyOn(document, "hasFocus").mockReturnValue(true);
      const user = userEvent.setup();
      render(<AccountSettings profile={profile} onProfileChange={vi.fn()} />);
      const checkbox = await screen.findByRole("checkbox", {
        name: "New comments on my bingos",
      });
      checkbox.focus();
      await user.keyboard(" ");
      expect(checkbox).toBeDisabled();
      // Model Firefox's disabled-input blur; jsdom retains a disabled input's focus.
      document.body.tabIndex = -1;
      document.body.focus();
      document.body.removeAttribute("tabindex");
      expect(document.body).toHaveFocus();

      await act(async () => {
        if (outcome === "success") resolveSave({ ...preferences, new_comment: false });
        else rejectSave(new Error("Offline"));
      });
      expect(checkbox).toBeEnabled();
      expect(checkbox).toHaveFocus();
      if (outcome === "failure") expect(checkbox).toBeChecked();
      else expect(checkbox).not.toBeChecked();
      await user.tab();
      expect(screen.getByRole("checkbox", { name: "Replies to my comments" })).toHaveFocus();
      expect(mocks.updatePreferences).toHaveBeenCalledOnce();
    },
  );

  it("shows a pending keyboard preference change, rolls an active failure back locally and retries", async () => {
    let rejectSave!: (error: Error) => void;
    mocks.updatePreferences.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    mocks.updatePreferences.mockResolvedValueOnce({ ...preferences, marketing_email: true });
    const user = userEvent.setup();
    render(
      <>
        <AccountSettings profile={profile} onProfileChange={vi.fn()} />
        <button type="button">After settings</button>
      </>,
    );
    const checkbox = await screen.findByRole("checkbox", {
      name: "Optional product email",
    });
    const previous = screen.getByRole("checkbox", { name: "New followers" });
    const card = screen
      .getByRole("heading", { name: "Notification preferences" })
      .closest(".settings-card")!;
    checkbox.focus();
    await user.tab({ shift: true });
    expect(previous).toHaveFocus();
    await user.tab();
    expect(checkbox).toHaveFocus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(previous).toBeDisabled();
    expect(within(card as HTMLElement).getByRole("status")).toHaveTextContent(
      "Saving notification preferences…",
    );
    await user.keyboard(" ");
    await user.tab();
    expect(screen.getByRole("link", { name: "Forgot your current password?" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After settings" })).toHaveFocus();
    expect(mocks.updatePreferences).toHaveBeenCalledOnce();
    expect(mocks.updatePreferences).toHaveBeenCalledWith({ marketing_email: true });

    await act(async () => rejectSave(new Error("Preferences temporarily unavailable.")));
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeEnabled();
    expect(previous).toBeChecked();
    expect(within(card as HTMLElement).getByRole("alert")).toHaveTextContent(
      "Preferences temporarily unavailable.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "After settings" })).toHaveFocus();

    checkbox.focus();
    await user.keyboard(" ");
    expect(await within(card as HTMLElement).findByRole("status")).toHaveTextContent(
      "Notification preferences saved.",
    );
    expect(checkbox).toBeChecked();
    expect(within(card as HTMLElement).queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.updatePreferences).toHaveBeenCalledTimes(2);
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
