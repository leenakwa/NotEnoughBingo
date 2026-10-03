import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { ProfileView } from "@/features/profile/profile-view";
import { AUTH_SIGNED_IN_EVENT } from "@/lib/auth-events";
import type { OwnUserProfile } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  me: vi.fn(),
  update: vi.fn(),
  updatePrivacy: vi.fn(),
  session: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({
  api: {
    profiles: {
      get: mocks.get,
      me: mocks.me,
      update: mocks.update,
      updatePrivacy: mocks.updatePrivacy,
    },
    auth: { session: mocks.session },
    follows: { follow: mocks.follow, unfollow: mocks.unfollow },
  },
  errorMessage: () => "Profile service unavailable.",
  fieldValidationMessage: () => undefined,
  isAuthenticationRequiredError: (error: { status?: number }) => error.status === 401,
}));
vi.mock("@/lib/auth-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-events")>()),
  notifyAuthChanged: mocks.notify,
}));
vi.mock("@/features/profile/account-settings", () => ({
  AccountSettings: () => <div>Account settings</div>,
}));
vi.mock("@/features/profile/profile-collections", () => ({
  ProfileCollections: () => <div>Profile collections</div>,
}));
vi.mock("@/features/social/report-dialog", () => ({ ReportDialog: () => null }));
vi.mock("@/features/profile/profile-edit-cache", () => ({
  readProfileEdits: () => undefined,
  rememberProfileEdits: vi.fn(),
}));
vi.mock("@/lib/use-unsaved-changes-warning", () => ({ useUnsavedChangesWarning: vi.fn() }));
vi.mock("@/components/ui/language-picker", () => ({
  LanguagePicker: ({
    value,
    onChange,
    disabled,
  }: {
    value: string[];
    onChange: (value: string[]) => void;
    disabled: boolean;
  }) => (
    <button disabled={disabled} onClick={() => onChange(["ru"])}>
      Preferred languages: {value.join(",")}
    </button>
  ),
}));
const first: OwnUserProfile = {
  id: "account-1",
  username: "first",
  display_name: "First profile",
  avatar: null,
  bio: "First bio",
  follower_count: 2,
  following_count: 0,
  is_following: false,
  preferred_languages: ["en"],
  language_preferences_confirmed: true,
  privacy: {
    show_bio: true,
    show_created_bingos: true,
    show_play_history: true,
    show_shared_results: true,
    show_followers: true,
    show_following: true,
  },
};
const next = {
  ...first,
  id: "account-2",
  username: "next",
  display_name: "Next profile",
  preferred_languages: ["de"],
  privacy: { ...first.privacy, show_bio: false },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(first);
  mocks.me.mockResolvedValue(first);
  mocks.session.mockResolvedValue({ id: "viewer" });
  mocks.update.mockResolvedValue(first);
  mocks.updatePrivacy.mockResolvedValue(first.privacy);
  mocks.follow.mockResolvedValue(undefined);
});
it("hides the previous profile when the next required load fails and retries the next username", async () => {
  mocks.get.mockRejectedValueOnce(new Error("Offline"));
  mocks.get.mockResolvedValueOnce(next);
  const view = render(<ProfileView username="first" initialProfile={first} />);
  view.rerender(<ProfileView username="next" />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: "First profile" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("heading", { name: "Next profile" })).toBeVisible();
  expect(mocks.get.mock.calls.map((call) => call[0])).toEqual(["next", "next"]);
});
it("does not expose protected profile actions before viewer identity is known", async () => {
  mocks.session.mockReturnValueOnce(new Promise(() => undefined));
  render(<ProfileView username="first" initialProfile={first} />);
  expect(screen.getByRole("heading", { name: "First profile" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Follow" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Report profile" })).not.toBeInTheDocument();
});
it("retries optional viewer failure without reloading the public profile", async () => {
  mocks.session.mockRejectedValueOnce(new Error("Offline"));
  mocks.session.mockResolvedValueOnce({ id: "viewer" });
  render(<ProfileView username="first" initialProfile={first} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { name: "First profile" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Log in to follow" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "Follow" })).toBeEnabled();
  expect(mocks.session).toHaveBeenCalledTimes(2);
  expect(mocks.get).not.toHaveBeenCalled();
});
it.each(["profile", "privacy", "languages"] as const)(
  "ignores old %s completion after account change",
  async (action) => {
    let resolveAction!: (value: OwnUserProfile | OwnUserProfile["privacy"]) => void;
    const deferred = new Promise<OwnUserProfile | OwnUserProfile["privacy"]>((resolve) => {
      resolveAction = resolve;
    });
    if (action === "privacy") mocks.updatePrivacy.mockReturnValueOnce(deferred);
    else mocks.update.mockReturnValueOnce(deferred);
    mocks.me.mockResolvedValueOnce(first);
    mocks.me.mockResolvedValueOnce(next);
    render(<ProfileView />);
    await screen.findByRole("heading", { name: "First profile" });
    if (action === "profile") {
      fireEvent.change(screen.getByLabelText("Display name"), {
        target: { value: "Pending name" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    } else if (action === "privacy") fireEvent.click(screen.getByLabelText("Show bio"));
    else {
      fireEvent.click(screen.getByRole("button", { name: "Preferred languages: en" }));
      fireEvent.click(screen.getByRole("button", { name: "Save languages" }));
    }
    act(() => window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT)));
    await screen.findByRole("heading", { name: "Next profile" });
    await act(async () => resolveAction(action === "privacy" ? first.privacy : first));
    expect(screen.getByRole("heading", { name: "Next profile" })).toBeVisible();
    expect(screen.getByLabelText("Show bio")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Preferred languages: de" })).toBeEnabled();
    expect(screen.queryByText(/saved\./)).not.toBeInTheDocument();
    expect(mocks.notify).not.toHaveBeenCalled();
  },
);
it("does not apply the previous profile's pending follow to the next profile", async () => {
  let resolveFollow!: () => void;
  mocks.follow.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveFollow = resolve;
    }),
  );
  mocks.get.mockResolvedValueOnce(next);
  const view = render(<ProfileView username="first" initialProfile={first} />);
  fireEvent.click(await screen.findByRole("button", { name: "Follow" }));
  view.rerender(<ProfileView username="next" />);
  await screen.findByRole("heading", { name: "Next profile" });
  await act(async () => resolveFollow());
  expect(screen.getByRole("heading", { name: "Next profile" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Follow" })).toBeEnabled();
});
it("hides previous own-profile content when a session reload is denied", async () => {
  mocks.me.mockResolvedValueOnce(first);
  mocks.me.mockRejectedValueOnce({ status: 401 });
  render(<ProfileView />);
  await screen.findByRole("heading", { name: "First profile" });
  act(() => window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT)));
  await waitFor(() => expect(screen.getByText("Log in to view your profile")).toBeVisible());
  expect(screen.queryByRole("heading", { name: "First profile" })).not.toBeInTheDocument();
});
