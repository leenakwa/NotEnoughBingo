import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSettings } from "@/features/profile/account-settings";
import {
  clearProfileEdits,
  readProfileEdits,
  rememberProfileEdits,
} from "@/features/profile/profile-edit-cache";
import type { AuthenticatedUser, NotificationPreferences, UserProfile } from "@/lib/api/types";
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
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock("@/lib/auth-events", () => ({
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
    },
    profiles: {
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
    mocks.me.mockResolvedValue(currentUser);
    mocks.sessions.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mocks.notificationPreferences.mockResolvedValue(preferences);
    mocks.cancelAccountDeletion.mockResolvedValue(undefined);
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
});
