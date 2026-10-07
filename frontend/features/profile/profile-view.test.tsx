import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  fieldValidationMessage: vi.fn(),
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
  fieldValidationMessage: mocks.fieldValidationMessage,
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
  vi.restoreAllMocks();
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
      fireEvent.click(screen.getByRole("checkbox", { name: "Russian" }));
      fireEvent.click(screen.getByRole("button", { name: "Save languages" }));
    }
    act(() => window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT)));
    await screen.findByRole("heading", { name: "Next profile" });
    await act(async () => resolveAction(action === "privacy" ? first.privacy : first));
    expect(screen.getByRole("heading", { name: "Next profile" })).toBeVisible();
    expect(screen.getByLabelText("Show bio")).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "German" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "German" })).toBeEnabled();
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

it("submits silently filled profile values and retains them for a failed save and retry", async () => {
  const submitted = {
    username: "filled_username",
    display_name: "填充енное имя 😊",
    bio: "First line\nВторая строка <>& \" ' 😊",
  };
  mocks.update.mockRejectedValueOnce(new Error("Offline"));
  mocks.update.mockResolvedValueOnce({ ...first, ...submitted });
  const user = userEvent.setup();
  render(<ProfileView initialProfile={first} />);
  const username = screen.getByLabelText("Username") as HTMLInputElement;
  const name = screen.getByLabelText("Display name") as HTMLInputElement;
  const bio = screen.getByLabelText("Bio") as HTMLTextAreaElement;
  username.focus();
  username.value = `  ${submitted.username}  `;
  name.value = submitted.display_name;
  bio.value = submitted.bio;
  await user.click(screen.getByRole("button", { name: "Save profile" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Profile service unavailable.");
  expect(mocks.update).toHaveBeenCalledWith(submitted);
  expect(username).toHaveValue(submitted.username);
  expect(name).toHaveValue(submitted.display_name);
  expect(bio).toHaveValue(submitted.bio);
  fireEvent.submit(username.closest("form")!);
  expect(await screen.findByText("Profile saved.")).toBeVisible();
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(mocks.update).toHaveBeenLastCalledWith(submitted);
  expect(screen.getByRole("heading", { name: submitted.display_name })).toBeVisible();
});

it("focuses a rejected filled field after enabling the profile form and keeps the other entries", async () => {
  let rejectSave!: (error: Error) => void;
  mocks.update.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      rejectSave = reject;
    }),
  );
  mocks.fieldValidationMessage.mockImplementation((_caught, field) =>
    field === "username" ? "This username is unavailable." : null,
  );
  render(<ProfileView initialProfile={first} />);
  const username = screen.getByLabelText("Username") as HTMLInputElement;
  const name = screen.getByLabelText("Display name") as HTMLInputElement;
  const bio = screen.getByLabelText("Bio") as HTMLTextAreaElement;
  username.value = "taken_username";
  name.value = "Retained name";
  bio.value = "Retained Unicode bio 😊";
  const save = screen.getByRole("button", { name: "Save profile" });
  save.focus();
  fireEvent.submit(username.closest("form")!);
  expect(username).toBeDisabled();
  await act(async () => rejectSave(new Error("Duplicate username")));

  expect(username).toBeEnabled();
  expect(username).toHaveFocus();
  expect(username).toHaveAttribute("aria-invalid", "true");
  expect(username).toHaveAccessibleDescription(
    "3–30 characters. Letters, numbers, and underscores. This username is unavailable.",
  );
  expect(username).toHaveValue("taken_username");
  expect(name).toHaveValue("Retained name");
  expect(bio).toHaveValue("Retained Unicode bio 😊");
  fireEvent.change(username, { target: { value: "available_username" } });
  expect(username).toHaveAttribute("aria-invalid", "false");
  expect(screen.queryByText("This username is unavailable.")).not.toBeInTheDocument();
});

it("accepts and preserves a bio up to the server's 500-character limit", async () => {
  const existing = { ...first, bio: "Б".repeat(500) };
  mocks.update.mockResolvedValueOnce(existing);
  render(<ProfileView initialProfile={existing} />);
  const bio = screen.getByLabelText("Bio");
  expect(bio).toHaveAttribute("maxlength", "500");
  expect(bio).toHaveAccessibleDescription("Optional. Up to 500 characters.");
  expect(bio).toHaveValue(existing.bio);
  fireEvent.submit(bio.closest("form")!);
  expect(await screen.findByText("Profile saved.")).toBeVisible();
  expect(mocks.update).toHaveBeenCalledWith({
    username: existing.username,
    display_name: existing.display_name,
    bio: existing.bio,
  });
  expect(bio).toHaveValue(existing.bio);
});

it("shows the supplied own-profile language preferences without an extra required load", () => {
  render(<ProfileView initialProfile={first} />);
  expect(screen.getByRole("checkbox", { name: "English" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Russian" })).not.toBeChecked();
  expect(mocks.me).not.toHaveBeenCalled();
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(false);
});

it.each(["selected", "all"] as const)(
  "retains %s language choices after a failed save, protects canceled navigation and retries",
  async (choice) => {
    let rejectSave!: (error: Error) => void;
    const selectedLanguages = choice === "selected" ? ["en", "ru"] : [];
    mocks.update.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    mocks.update.mockResolvedValueOnce({ ...first, preferred_languages: selectedLanguages });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(
      <>
        <ProfileView />
        <a href="/discover">Discover</a>
      </>,
    );
    await screen.findByRole("heading", { name: "First profile" });
    const english = screen.getByRole("checkbox", { name: "English" });
    const russian = screen.getByRole("checkbox", { name: "Russian" });
    const group = screen.getByRole("group", { name: "Preferred languages" });
    const card = screen
      .getByRole("heading", { name: "Bingo languages" })
      .closest(".settings-card")!;
    const checkbox = choice === "selected" ? russian : english;
    checkbox.focus();
    await user.keyboard(" ");
    expect(english).toHaveProperty("checked", choice === "selected");
    expect(russian).toHaveProperty("checked", choice === "selected");

    const lastLanguage = within(group).getAllByRole("checkbox").at(-1);
    if (!lastLanguage) throw new Error("The language chooser must contain a checkbox.");
    lastLanguage.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Save languages" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(within(card as HTMLElement).getByRole("status")).toHaveTextContent("Saving changes…");
    expect(english).toBeDisabled();
    expect(russian).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "German" }));
    await user.keyboard("{Enter}");
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({ preferred_languages: selectedLanguages });

    await act(async () => rejectSave(new Error("Offline")));
    expect(within(card as HTMLElement).getByRole("alert")).toHaveTextContent(
      "Profile service unavailable.",
    );
    expect(english).toBeEnabled();
    expect(english).toHaveProperty("checked", choice === "selected");
    expect(russian).toHaveProperty("checked", choice === "selected");
    expect(screen.getByRole("checkbox", { name: "German" })).not.toBeChecked();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(fireEvent.click(screen.getByRole("link", { name: "Discover" }))).toBe(false);
    expect(confirm).toHaveBeenCalledWith("Your profile changes have not been saved. Leave anyway?");
    expect(screen.getByRole("heading", { name: "First profile" })).toBeVisible();
    const dirtyUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyUnload);
    expect(dirtyUnload.defaultPrevented).toBe(true);

    await user.click(screen.getByRole("button", { name: "Save languages" }));
    expect(within(card as HTMLElement).getByRole("status")).toHaveTextContent(
      "Bingo languages saved.",
    );
    expect(within(card as HTMLElement).queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenLastCalledWith({ preferred_languages: selectedLanguages });
    const savedUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedUnload);
    expect(savedUnload.defaultPrevented).toBe(false);
  },
);

it("rolls back a failed keyboard privacy change with scoped feedback and allows retry", async () => {
  let rejectSave!: (error: Error) => void;
  const changedPrivacy = { ...first.privacy, show_bio: false };
  mocks.updatePrivacy.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      rejectSave = reject;
    }),
  );
  mocks.updatePrivacy.mockResolvedValueOnce(changedPrivacy);
  const user = userEvent.setup();
  render(
    <>
      <ProfileView />
      <button type="button">After settings</button>
    </>,
  );
  await screen.findByRole("heading", { name: "First profile" });
  const name = screen.getByLabelText("Display name");
  fireEvent.change(name, { target: { value: "Unsaved name" } });
  const checkbox = screen.getByRole("checkbox", { name: "Show bio" });
  const card = screen.getByRole("heading", { name: "Privacy" }).closest(".settings-card")!;
  checkbox.focus();
  await user.keyboard(" ");
  expect(checkbox).not.toBeChecked();
  expect(checkbox).toBeDisabled();
  expect(within(card as HTMLElement).getByRole("status")).toHaveTextContent(
    "Saving privacy settings…",
  );
  expect(screen.getByRole("checkbox", { name: "Show followers" })).toBeDisabled();
  await user.keyboard(" ");
  await user.tab();
  expect(screen.getByRole("button", { name: "After settings" })).toHaveFocus();
  expect(mocks.updatePrivacy).toHaveBeenCalledOnce();
  expect(mocks.updatePrivacy).toHaveBeenCalledWith(changedPrivacy);

  await act(async () => rejectSave(new Error("Offline")));
  expect(checkbox).toBeChecked();
  expect(checkbox).toBeEnabled();
  expect(screen.getByRole("checkbox", { name: "Show followers" })).toBeChecked();
  expect(name).toHaveValue("Unsaved name");
  expect(within(card as HTMLElement).getByRole("alert")).toHaveTextContent(
    "Profile service unavailable.",
  );
  expect(screen.getAllByRole("alert")).toHaveLength(1);

  checkbox.focus();
  await user.keyboard(" ");
  expect(await within(card as HTMLElement).findByRole("status")).toHaveTextContent(
    "Privacy settings saved.",
  );
  expect(checkbox).not.toBeChecked();
  expect(name).toHaveValue("Unsaved name");
  expect(within(card as HTMLElement).queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.updatePrivacy).toHaveBeenCalledTimes(2);
});
