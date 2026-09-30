import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSettings } from "@/features/profile/account-settings";
import type { AuthenticatedUser, NotificationPreferences, UserProfile } from "@/lib/api/types";
import { uploadImage } from "@/lib/uploads";

const mocks = vi.hoisted(() => ({
  cancelAccountDeletion: vi.fn(),
  me: vi.fn(),
  notificationPreferences: vi.fn(),
  notifyAuthChanged: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  scheduleAccountDeletion: vi.fn(),
  sessions: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock("@/lib/auth-events", () => ({
  notifyAuthChanged: mocks.notifyAuthChanged,
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
    },
    profiles: {
      notificationPreferences: mocks.notificationPreferences,
    },
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
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
    expect(mocks.notifyAuthChanged).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith("/login?next=%2Fprofile&reason=deletion-scheduled");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
