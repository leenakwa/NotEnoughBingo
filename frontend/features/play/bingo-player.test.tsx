import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BingoPlayer } from "@/features/play/bingo-player";
import type { AuthenticatedUser, BingoDetail, PlayProgress, UserProfile } from "@/lib/api/types";
import { readGuestProgress, writeGuestProgress } from "@/lib/guest-progress";
import { AUTH_SIGNED_IN_EVENT, AUTH_SIGNED_OUT_EVENT } from "@/lib/auth-events";
import { ApiClientError } from "@/lib/api/client";

const mocks = vi.hoisted(() => ({
  getBingo: vi.fn(),
  getProfile: vi.fn(),
  getViewer: vi.fn(),
  getProgress: vi.fn(),
  saveProgress: vi.fn(),
  resetProgress: vi.fn(),
  createShare: vi.fn(),
  likeBingo: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  track: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
  }),
}));

vi.mock("@/lib/analytics", () => ({
  trackInteraction: mocks.track,
}));

vi.mock("@/features/social/comments-panel", () => ({
  CommentsPanel: () => <div>Comments</div>,
}));

vi.mock("@/features/social/report-dialog", () => ({
  ReportDialog: () => null,
}));

vi.mock("@/lib/api/client", () => ({
  api: {
    auth: { session: mocks.getViewer },
    bingos: {
      get: mocks.getBingo,
      like: mocks.likeBingo,
      archive: mocks.archive,
      restore: mocks.restore,
      remove: mocks.remove,
    },
    follows: { follow: mocks.follow, unfollow: mocks.unfollow },
    shares: { create: mocks.createShare },
    profiles: { get: mocks.getProfile },
    progress: {
      get: mocks.getProgress,
      save: mocks.saveProgress,
      reset: mocks.resetProgress,
    },
  },
  ApiClientError: class extends Error {
    readonly status: number;
    constructor(status: number, payload: { message: string }) {
      super(payload.message);
      this.status = status;
    }
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
  isAuthenticationRequiredError: () => false,
}));

const viewer: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "reader",
  display_name: "Reader",
  avatar: null,
  email: "reader@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};

const bingo: BingoDetail = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Hydration safety",
  description: "",
  language: "en",
  author: {
    id: "33333333-3333-4333-8333-333333333333",
    username: "author",
    display_name: "Author",
    avatar: null,
  },
  cover: null,
  preview: null,
  tags: [],
  size: 3,
  status: "published",
  visibility: "public",
  completion_style: "checkmark",
  stats: {
    likes: 0,
    comments: 0,
    plays: 1,
    shares: 0,
    views: 1,
  },
  liked_by_me: false,
  published_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:00Z",
  current_revision: {
    id: "44444444-4444-4444-8444-444444444444",
    number: 1,
    title: "Hydration safety",
    description: "",
    language: "en",
    size: 3,
    board_background: null,
    cover: null,
    completion_style: "checkmark",
    cells: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        row: 0,
        column: 0,
        text: "Open the board",
        text_color: "#000000",
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        background_color: "#ffffff",
        background_opacity: 1,
        image: null,
        image_alt: "",
        image_opacity: 1,
        border_color: "#000000",
        border_width: 1,
        border_style: "solid",
      },
    ],
    published_at: "2026-07-20T00:00:00Z",
  },
  permissions: {
    can_edit: false,
    can_comment: true,
    can_like: true,
    can_report: true,
  },
};

const authorProfile: UserProfile = {
  ...bingo.author,
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

const progress: PlayProgress = {
  public_id: "66666666-6666-4666-8666-666666666666",
  bingo_id: bingo.id,
  revision_id: bingo.current_revision!.id,
  revision_number: 1,
  selected_cells: [],
  version: 2,
  stale: false,
  reset_at: null,
  created_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:00Z",
};

describe("BingoPlayer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.getBingo.mockResolvedValue(bingo);
    mocks.getViewer.mockResolvedValue(viewer);
    mocks.getProgress.mockResolvedValue(progress);
    mocks.saveProgress.mockResolvedValue({ ...progress, version: 3 });
    mocks.resetProgress.mockResolvedValue(undefined);
    mocks.getProfile.mockRejectedValue(new Error("Profile is optional here"));
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(["guest", "registered"])(
    "keeps the server-rendered board through StrictMode effect replay for a %s viewer",
    async (mode) => {
      render(
        <StrictMode>
          <BingoPlayer
            bingoId={bingo.id}
            initialBingo={bingo}
            initialViewer={mode === "guest" ? "guest" : viewer}
          />
        </StrictMode>,
      );

      expect(screen.getByRole("heading", { name: bingo.title })).toBeVisible();
      expect(screen.queryByText("Opening bingo…")).not.toBeInTheDocument();
      expect(mocks.getBingo).not.toHaveBeenCalled();
      const cell = screen.getByRole("button", { name: "Open the board" });
      await waitFor(() => expect(cell).toBeEnabled());
      expect(mocks.getViewer).not.toHaveBeenCalled();
      expect(mocks.saveProgress).not.toHaveBeenCalled();
      await act(async () => cell.click());
      expect(cell).toHaveAttribute("aria-pressed", "true");
      expect(mocks.getBingo).not.toHaveBeenCalled();
      window.localStorage.clear();
    },
  );

  it.each(["leave", "logout"])("does not send queued marks after %s", async (boundary) => {
    let resolveSave!: (value: PlayProgress) => void;
    mocks.saveProgress.mockReturnValueOnce(
      new Promise<PlayProgress>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const view = render(
      <BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />,
    );
    const cell = screen.getByRole("button", { name: "Open the board" });
    await waitFor(() => expect(cell).toBeEnabled());
    await act(async () => cell.click());
    await waitFor(() => expect(mocks.saveProgress).toHaveBeenCalledTimes(1));
    await act(async () => cell.click());
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 450)));
    if (boundary === "leave") view.unmount();
    else {
      mocks.getViewer.mockResolvedValueOnce(null);
      act(() => window.dispatchEvent(new Event(AUTH_SIGNED_OUT_EVENT)));
      await waitFor(() =>
        expect(screen.getByRole("link", { name: "Log in to like" })).toBeVisible(),
      );
    }
    await act(async () => resolveSave({ ...progress, version: 2 }));
    expect(mocks.saveProgress).toHaveBeenCalledTimes(1);
  });

  it("does not retry an obsolete progress conflict after departure", async () => {
    let rejectSave!: (error: Error) => void;
    mocks.saveProgress.mockReturnValueOnce(
      new Promise<PlayProgress>((_resolve, reject) => {
        rejectSave = reject;
      }),
    );
    const view = render(
      <BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />,
    );
    const cell = screen.getByRole("button", { name: "Open the board" });
    await waitFor(() => expect(cell).toBeEnabled());
    await act(async () => cell.click());
    await waitFor(() => expect(mocks.saveProgress).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () =>
      rejectSave(new ApiClientError(409, { code: "conflict", message: "Old version" })),
    );
    expect(mocks.getProgress).toHaveBeenCalledTimes(1);
    expect(mocks.saveProgress).toHaveBeenCalledTimes(1);
  });

  it("does not let an old save replace the next board's progress version", async () => {
    let resolveSave!: (value: PlayProgress) => void;
    mocks.saveProgress.mockReturnValueOnce(
      new Promise<PlayProgress>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const view = render(
      <BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />,
    );
    const cell = screen.getByRole("button", { name: "Open the board" });
    await waitFor(() => expect(cell).toBeEnabled());
    await act(async () => cell.click());
    await waitFor(() => expect(mocks.saveProgress).toHaveBeenCalledTimes(1));
    const next = {
      ...bingo,
      id: "next-board",
      title: "Next board",
      current_revision: { ...bingo.current_revision!, title: "Next board" },
    };
    mocks.getBingo.mockResolvedValueOnce(next);
    mocks.getProgress.mockResolvedValueOnce({ ...progress, version: 8 });
    mocks.saveProgress.mockResolvedValueOnce({ ...progress, version: 9 });
    view.rerender(<BingoPlayer bingoId={next.id} initialBingo={bingo} initialViewer={viewer} />);
    await screen.findByRole("heading", { name: "Next board" });
    expect(mocks.getBingo).toHaveBeenCalledExactlyOnceWith(next.id);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open the board" })).toBeEnabled(),
    );
    await act(async () => resolveSave({ ...progress, version: 2 }));
    await act(async () => screen.getByRole("button", { name: "Open the board" }).click());
    await waitFor(() => expect(mocks.saveProgress).toHaveBeenCalledTimes(2));
    expect(mocks.saveProgress).toHaveBeenLastCalledWith(
      next.id,
      bingo.current_revision!.id,
      [bingo.current_revision!.cells[0]!.id],
      8,
    );
  });

  it("does not reload progress after a departed reset completes", async () => {
    mocks.getProgress.mockResolvedValueOnce({
      ...progress,
      selected_cells: [bingo.current_revision!.cells[0]!.id],
    });
    let resolveReset!: () => void;
    mocks.resetProgress.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveReset = resolve;
      }),
    );
    const view = render(
      <BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />,
    );
    const reset = await screen.findByRole("button", { name: "Reset" });
    await waitFor(() => expect(reset).toBeEnabled());
    await act(async () => reset.click());
    await waitFor(() => expect(mocks.resetProgress).toHaveBeenCalledTimes(1));
    view.unmount();
    await act(async () => resolveReset());
    expect(mocks.getProgress).toHaveBeenCalledTimes(1);
  });

  it("does not open a completed share from a departed player", async () => {
    let resolveShare!: (value: { id: string }) => void;
    mocks.createShare.mockReturnValueOnce(
      new Promise<{ id: string }>((resolve) => {
        resolveShare = resolve;
      }),
    );
    const view = render(
      <BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />,
    );
    const share = screen.getByRole("button", { name: "Share result" });
    await waitFor(() => expect(share).toBeEnabled());
    await act(async () => share.click());
    await act(async () => screen.getByRole("button", { name: "Create share link" }).click());
    expect(mocks.createShare).toHaveBeenCalledTimes(1);
    expect(mocks.createShare).toHaveBeenCalledWith(
      bingo.id,
      { revision_id: bingo.current_revision!.id, selected_cells: [] },
      expect.any(String),
    );
    view.unmount();
    await act(async () => resolveShare({ id: "old-share" }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"] as const)(
    "ignores an old guest share %s while the next board's share remains pending",
    async (outcome) => {
      let resolveOldShare!: (value: { id: string }) => void;
      let rejectOldShare!: (error: Error) => void;
      let resolveCurrentShare!: (value: { id: string }) => void;
      mocks.createShare.mockReturnValueOnce(
        new Promise<{ id: string }>((resolve, reject) => {
          resolveOldShare = resolve;
          rejectOldShare = reject;
        }),
      );
      mocks.createShare.mockReturnValueOnce(
        new Promise<{ id: string }>((resolve) => {
          resolveCurrentShare = resolve;
        }),
      );
      const user = userEvent.setup();
      const view = render(
        <BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />,
      );
      const oldShare = screen.getByRole("button", { name: "Share result" });
      await waitFor(() => expect(oldShare).toBeEnabled());
      await user.click(oldShare);
      await user.type(screen.getByRole("textbox", { name: "Your nickname" }), "Old guest");
      act(() =>
        screen.getByRole<HTMLFormElement>("form", { name: "Share this result" }).requestSubmit(),
      );
      expect(mocks.createShare).toHaveBeenCalledOnce();

      const next = {
        ...bingo,
        id: "next-board",
        title: "Next board",
        current_revision: {
          ...bingo.current_revision!,
          id: "next-revision",
          title: "Next board",
        },
      };
      mocks.getBingo.mockResolvedValueOnce(next);
      mocks.getViewer.mockResolvedValueOnce(null);
      view.rerender(<BingoPlayer bingoId={next.id} />);
      await screen.findByRole("heading", { name: "Next board" });
      const currentShare = screen.getByRole("button", { name: "Share result" });
      await waitFor(() => expect(currentShare).toBeEnabled());
      await user.click(currentShare);
      const input = screen.getByRole("textbox", { name: "Your nickname" });
      expect(input).toHaveValue("");
      await user.type(input, "Current guest");
      const form = screen.getByRole<HTMLFormElement>("form", { name: "Share this result" });
      act(() => form.requestSubmit());
      expect(mocks.createShare).toHaveBeenCalledTimes(2);
      expect(mocks.createShare).toHaveBeenLastCalledWith(
        next.id,
        {
          revision_id: next.current_revision.id,
          selected_cells: [],
          display_name: "Current guest",
        },
        expect.any(String),
      );

      await act(async () => {
        if (outcome === "success") resolveOldShare({ id: "obsolete-share" });
        else rejectOldShare(new Error("Obsolete share failure"));
      });
      expect(mocks.push).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(input).toHaveValue("Current guest");
      expect(input).toBeDisabled();
      expect(screen.getByRole("button", { name: "Creating link…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      act(() => {
        fireEvent.submit(form);
        fireEvent.submit(form);
      });
      expect(mocks.createShare).toHaveBeenCalledTimes(2);

      await act(async () => resolveCurrentShare({ id: "current-share" }));
      expect(mocks.push).toHaveBeenCalledOnce();
      expect(mocks.push).toHaveBeenCalledWith(`/share/${next.id}/current-share`);
      expect(mocks.createShare).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["", "   "])(
    "keeps a guest's %j nickname error beside the focused input without creating a share",
    async (value) => {
      const user = userEvent.setup();
      render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />);
      const share = screen.getByRole("button", { name: "Share result" });
      await waitFor(() => expect(share).toBeEnabled());
      await user.click(share);
      const input = screen.getByRole("textbox", { name: "Your nickname" });
      expect(input).toBeRequired();
      expect(input).toHaveAttribute("maxlength", "50");
      expect(input).toHaveAccessibleDescription("Required. Up to 50 characters.");
      fireEvent.change(input, { target: { value } });
      await user.click(screen.getByRole("button", { name: "Create share link" }));

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Enter a nickname to create a guest share link.",
      );
      expect(input).toHaveFocus();
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription(
        "Required. Up to 50 characters. Enter a nickname to create a guest share link.",
      );
      expect(mocks.createShare).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: "Corrected nickname" } });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(input).toHaveAttribute("aria-invalid", "false");
    },
  );

  it("creates one guest share with a trimmed Unicode nickname when Enter submits the form", async () => {
    const user = userEvent.setup();
    mocks.createShare.mockResolvedValueOnce({ id: "guest-share" });
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />);
    const share = screen.getByRole("button", { name: "Share result" });
    await waitFor(() => expect(share).toBeEnabled());
    await user.click(share);
    await user.type(screen.getByRole("textbox", { name: "Your nickname" }), "  Мила 🦊  {Enter}");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/share/${bingo.id}/guest-share`));
    expect(mocks.createShare).toHaveBeenCalledOnce();
    expect(mocks.createShare).toHaveBeenCalledWith(
      bingo.id,
      {
        revision_id: bingo.current_revision!.id,
        selected_cells: [],
        display_name: "Мила 🦊",
      },
      expect.any(String),
    );
  });

  it("submits a silently filled nickname from the form rather than the empty React state", async () => {
    const user = userEvent.setup();
    mocks.createShare.mockResolvedValueOnce({ id: "autofilled-share" });
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />);
    const share = screen.getByRole("button", { name: "Share result" });
    await waitFor(() => expect(share).toBeEnabled());
    await user.click(share);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Your nickname" });
    const form = screen.getByRole<HTMLFormElement>("form", { name: "Share this result" });
    input.value = "  Автозаполнение 🦊  ";
    await act(async () => form.requestSubmit());

    expect(mocks.createShare).toHaveBeenCalledOnce();
    expect(mocks.createShare).toHaveBeenCalledWith(
      bingo.id,
      {
        revision_id: bingo.current_revision!.id,
        selected_cells: [],
        display_name: "Автозаполнение 🦊",
      },
      expect.any(String),
    );
    expect(mocks.push).toHaveBeenCalledWith(`/share/${bingo.id}/autofilled-share`);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps and retries the visible submitted nickname after silent replacement and a request failure", async () => {
    let rejectShare!: (error: Error) => void;
    mocks.createShare.mockReturnValueOnce(
      new Promise<{ id: string }>((_resolve, reject) => {
        rejectShare = reject;
      }),
    );
    mocks.createShare.mockResolvedValueOnce({ id: "retried-autofilled-share" });
    const user = userEvent.setup();
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />);
    const share = screen.getByRole("button", { name: "Share result" });
    await waitFor(() => expect(share).toBeEnabled());
    await user.click(share);
    const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Your nickname" });
    const form = screen.getByRole<HTMLFormElement>("form", { name: "Share this result" });
    await user.type(input, "Previous React nickname");
    input.value = "  Current visible nickname  ";
    act(() => form.requestSubmit());

    expect(mocks.createShare).toHaveBeenCalledOnce();
    expect(mocks.createShare).toHaveBeenLastCalledWith(
      bingo.id,
      {
        revision_id: bingo.current_revision!.id,
        selected_cells: [],
        display_name: "Current visible nickname",
      },
      expect.any(String),
    );
    expect(input).toHaveValue("  Current visible nickname  ");
    await act(async () => rejectShare(new Error("Sharing temporarily unavailable.")));
    expect(screen.getByRole("alert")).toHaveTextContent("Sharing temporarily unavailable.");
    expect(input).toHaveValue("  Current visible nickname  ");
    await act(async () => form.requestSubmit());

    expect(mocks.createShare).toHaveBeenCalledTimes(2);
    expect(mocks.createShare).toHaveBeenLastCalledWith(
      bingo.id,
      {
        revision_id: bingo.current_revision!.id,
        selected_cells: [],
        display_name: "Current visible nickname",
      },
      expect.any(String),
    );
    expect(mocks.push).toHaveBeenCalledWith(`/share/${bingo.id}/retried-autofilled-share`);
  });

  it("locks duplicate submits and cancellation until share creation settles, keeping a failed nickname", async () => {
    let rejectShare!: (error: Error) => void;
    mocks.createShare.mockReturnValueOnce(
      new Promise<{ id: string }>((_resolve, reject) => {
        rejectShare = reject;
      }),
    );
    const user = userEvent.setup();
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />);
    const share = screen.getByRole("button", { name: "Share result" });
    await waitFor(() => expect(share).toBeEnabled());
    await user.click(share);
    const input = screen.getByRole("textbox", { name: "Your nickname" });
    fireEvent.change(input, { target: { value: "Guest waiting" } });
    const form = screen.getByRole("form", { name: "Share this result" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      cancel.click();
    });
    expect(mocks.createShare).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Creating link…" })).toBeDisabled();
    expect(cancel).toBeDisabled();
    expect(input).toBeDisabled();
    expect(form).toBeVisible();

    await act(async () => rejectShare(new Error("The service could not create this link.")));
    expect(screen.getByRole("alert")).toHaveTextContent("The service could not create this link.");
    expect(input).toHaveValue("Guest waiting");
    expect(input).toBeEnabled();
    expect(cancel).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create share link" })).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.createShare.mockRejectedValueOnce(new Error("The retry also failed."));
    await user.click(screen.getByRole("button", { name: "Create share link" }));
    expect(mocks.createShare).toHaveBeenCalledTimes(2);
    expect(mocks.createShare).toHaveBeenLastCalledWith(
      bingo.id,
      {
        revision_id: bingo.current_revision!.id,
        selected_cells: [],
        display_name: "Guest waiting",
      },
      expect.any(String),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("The retry also failed.");
    await user.click(cancel);
    expect(screen.queryByRole("form", { name: "Share this result" })).not.toBeInTheDocument();
    await waitFor(() => expect(share).toHaveFocus());
  });

  it("cancels an unsubmitted guest share and returns focus without sending a request", async () => {
    const user = userEvent.setup();
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />);
    const share = screen.getByRole("button", { name: "Share result" });
    await waitFor(() => expect(share).toBeEnabled());
    await user.click(share);
    await user.type(screen.getByRole("textbox", { name: "Your nickname" }), "Guest not sharing");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Share this result" })).not.toBeInTheDocument();
    await waitFor(() => expect(share).toHaveFocus());
    expect(mocks.createShare).not.toHaveBeenCalled();
  });

  it("does not apply an old like response to the next board", async () => {
    let resolveLike!: (value: BingoDetail) => void;
    mocks.likeBingo.mockReturnValueOnce(
      new Promise<BingoDetail>((resolve) => {
        resolveLike = resolve;
      }),
    );
    const view = render(
      <BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />,
    );
    const like = screen.getByRole("button", { name: "Like · 0" });
    await waitFor(() => expect(like).toBeEnabled());
    await act(async () => like.click());
    const next = {
      ...bingo,
      id: "next-board",
      title: "Next board",
      current_revision: { ...bingo.current_revision!, title: "Next board" },
      stats: { ...bingo.stats, likes: 7 },
    };
    mocks.getBingo.mockResolvedValueOnce(next);
    view.rerender(<BingoPlayer bingoId={next.id} />);
    await screen.findByRole("heading", { name: "Next board" });
    await act(async () =>
      resolveLike({ ...bingo, liked_by_me: true, stats: { ...bingo.stats, likes: 15 } }),
    );
    expect(screen.getByRole("button", { name: "Like · 7" })).toBeVisible();
  });

  it("does not write progress merely because server state was hydrated", async () => {
    render(<BingoPlayer bingoId={bingo.id} />);

    expect(await screen.findByRole("heading", { name: bingo.title })).toBeVisible();
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 450)));

    expect(mocks.getProgress).toHaveBeenCalledWith(bingo.id);
    expect(mocks.saveProgress).not.toHaveBeenCalled();
  });

  it("uses a server-verified viewer immediately without a second session request", async () => {
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />);

    expect(screen.getByRole("button", { name: "Like · 0" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    await act(() => Promise.resolve());
    expect(mocks.getViewer).not.toHaveBeenCalled();
  });

  it("does not wait for the optional author profile before loading progress and enabling play", async () => {
    mocks.getProfile.mockReturnValueOnce(new Promise(() => undefined));
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />);
    const cell = screen.getByRole("button", { name: "Open the board" });
    await waitFor(() => expect(cell).toBeEnabled());
    expect(mocks.getProgress).toHaveBeenCalledWith(bingo.id);
    expect(mocks.saveProgress).not.toHaveBeenCalled();
  });

  it("does not allow empty marks to overwrite progress after an initial read failure and supports retry", async () => {
    const cellId = bingo.current_revision!.cells[0]!.id!;
    mocks.getProgress.mockRejectedValueOnce(
      new Error("Saved progress is temporarily unavailable."),
    );
    mocks.getProgress.mockResolvedValueOnce({ ...progress, selected_cells: [cellId] });
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />);
    await screen.findByRole("alert");
    const cell = screen.getByRole("button", { name: "Open the board" });
    expect(cell).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share result" })).toBeDisabled();
    expect(screen.queryByText("Loading your progress…")).not.toBeInTheDocument();
    await act(async () => cell.click());
    expect(mocks.saveProgress).not.toHaveBeenCalled();
    await act(async () => screen.getByRole("button", { name: "Retry loading progress" }).click());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open the board, selected" })).toBeEnabled(),
    );
    expect(mocks.getProgress).toHaveBeenCalledTimes(2);
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 450)));
    expect(mocks.saveProgress).not.toHaveBeenCalled();
  });

  it("allows a first play when no saved progress exists", async () => {
    mocks.getProgress.mockRejectedValueOnce(
      new ApiClientError(404, {
        code: "not_found",
        message: "No saved progress.",
      }),
    );
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Open the board" })).toBeEnabled(),
    );
    expect(
      screen.queryByRole("button", { name: "Retry loading progress" }),
    ).not.toBeInTheDocument();
    expect(mocks.saveProgress).not.toHaveBeenCalled();
  });

  it("keeps saved guest cells while the server-rendered viewer hydrates", async () => {
    const cellId = bingo.current_revision!.cells[0]!.id!;
    writeGuestProgress(bingo.id, bingo.current_revision!.id, [cellId]);

    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />);

    expect(await screen.findByRole("button", { name: "Open the board, selected" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(readGuestProgress(bingo.id, bingo.current_revision!.id)?.selected_cells).toEqual([
      cellId,
    ]);
    expect(mocks.getViewer).not.toHaveBeenCalled();
    window.localStorage.clear();
  });

  it("keeps guest marks and syncs them after signing in over the board", async () => {
    const cellId = bingo.current_revision!.cells[0]!.id!;
    writeGuestProgress(bingo.id, bingo.current_revision!.id, [cellId]);
    mocks.saveProgress.mockResolvedValue({ ...progress, selected_cells: [cellId], version: 3 });
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer="guest" />);
    await screen.findByRole("button", { name: "Open the board, selected" });

    act(() => window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT)));

    await screen.findByRole("button", { name: "Like · 0" });
    expect(mocks.getBingo).toHaveBeenCalledExactlyOnceWith(bingo.id);
    expect(screen.getByRole("button", { name: "Open the board, selected" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() =>
      expect(mocks.saveProgress).toHaveBeenCalledWith(
        bingo.id,
        bingo.current_revision!.id,
        [cellId],
        2,
      ),
    );
    window.localStorage.clear();
  });

  it("waits for initial progress before allowing the first mark", async () => {
    let finish!: (value: PlayProgress) => void;
    mocks.getProgress.mockImplementationOnce(
      () =>
        new Promise<PlayProgress>((resolve) => {
          finish = resolve;
        }),
    );
    render(<BingoPlayer bingoId={bingo.id} initialBingo={bingo} initialViewer={viewer} />);
    const cell = screen.getByRole("button", { name: "Open the board" });
    expect(cell).toBeDisabled();
    expect(screen.getByRole("button", { name: "Share result" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Like · 0" })).toBeDisabled();
    expect(screen.getByText("Loading your progress…")).toBeVisible();
    cell.click();
    await waitFor(() => expect(mocks.getProgress).toHaveBeenCalled());
    await act(async () => {
      finish(progress);
    });
    expect(cell).toBeEnabled();
    expect(screen.getByRole("button", { name: "Like · 0" })).toBeEnabled();
    await act(async () => {
      cell.click();
    });
    expect(cell).toHaveAttribute("aria-pressed", "true");
  });

  it("restores selected cells when a registered reset fails offline", async () => {
    mocks.getProgress.mockResolvedValue({
      ...progress,
      selected_cells: [bingo.current_revision!.cells[0]!.id],
    });
    mocks.resetProgress.mockRejectedValueOnce(new Error("Unable to reach the service"));
    render(<BingoPlayer bingoId={bingo.id} />);

    const cell = await screen.findByRole("button", { name: "Open the board, selected" });
    expect(cell).toHaveAttribute("aria-pressed", "true");
    const reset = screen.getByRole("button", { name: "Reset" });
    await waitFor(() => expect(reset).toBeEnabled());
    await act(async () => {
      reset.click();
      await Promise.resolve();
    });

    expect(await screen.findByText("Unable to reach the service")).toBeVisible();
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(mocks.track).not.toHaveBeenCalledWith("reset", expect.anything());
  });

  it("keeps marks when reset is cancelled", async () => {
    mocks.getProgress.mockResolvedValue({
      ...progress,
      selected_cells: [bingo.current_revision!.cells[0]!.id],
    });
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<BingoPlayer bingoId={bingo.id} />);

    const cell = await screen.findByRole("button", { name: "Open the board, selected" });
    screen.getByRole("button", { name: "Reset" }).click();
    expect(window.confirm).toHaveBeenCalledWith(
      "Clear all marks on this bingo? This cannot be undone.",
    );
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(mocks.resetProgress).not.toHaveBeenCalled();
  });

  it("keeps guest selections when browser storage blocks reset", async () => {
    mocks.getViewer.mockResolvedValue(null);
    writeGuestProgress(bingo.id, bingo.current_revision!.id, [
      bingo.current_revision!.cells[0]!.id!,
    ]);
    render(<BingoPlayer bingoId={bingo.id} />);

    const cell = await screen.findByRole("button", { name: "Open the board, selected" });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    await act(async () => {
      screen.getByRole("button", { name: "Reset" }).click();
    });

    expect(screen.getByText(/progress could not be reset/)).toBeVisible();
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(mocks.track).not.toHaveBeenCalledWith("reset", expect.anything());
    window.localStorage.clear();
  });

  it.each(["like", "follow"] as const)(
    "sends one %s request for synchronous duplicate clicks",
    async (action) => {
      mocks.getProfile.mockResolvedValue(authorProfile);
      mocks.likeBingo.mockReturnValue(new Promise(() => {}));
      mocks.follow.mockReturnValue(new Promise(() => {}));
      render(
        <BingoPlayer
          bingoId={bingo.id}
          initialBingo={bingo}
          initialViewer={viewer}
          initialAuthorProfile={authorProfile}
        />,
      );
      const button = screen.getByRole("button", {
        name: action === "like" ? "Like · 0" : "Follow author",
      });
      await waitFor(() => expect(button).toBeEnabled());
      await act(async () => {
        button.click();
        button.click();
      });
      expect(action === "like" ? mocks.likeBingo : mocks.follow).toHaveBeenCalledOnce();
      expect(button).toBeDisabled();
    },
  );

  it("locks other social actions immediately while a like is starting", async () => {
    mocks.getProfile.mockResolvedValue(authorProfile);
    mocks.likeBingo.mockReturnValue(new Promise(() => {}));
    mocks.follow.mockReturnValue(new Promise(() => {}));
    render(
      <BingoPlayer
        bingoId={bingo.id}
        initialBingo={bingo}
        initialViewer={viewer}
        initialAuthorProfile={authorProfile}
      />,
    );
    const like = screen.getByRole("button", { name: "Like · 0" });
    const follow = screen.getByRole("button", { name: "Follow author" });
    await waitFor(() => expect(like).toBeEnabled());
    await act(async () => {
      like.click();
      follow.click();
    });
    expect(mocks.likeBingo).toHaveBeenCalledOnce();
    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"] as const)(
    "ignores a previous author's follow %s on the next board",
    async (outcome) => {
      let resolveFollow!: () => void;
      let rejectFollow!: (error: Error) => void;
      mocks.follow.mockReturnValue(
        new Promise<void>((resolve, reject) => {
          resolveFollow = resolve;
          rejectFollow = reject;
        }),
      );
      mocks.getProfile.mockResolvedValue(authorProfile);
      const view = render(
        <BingoPlayer
          bingoId={bingo.id}
          initialBingo={bingo}
          initialViewer={viewer}
          initialAuthorProfile={authorProfile}
        />,
      );
      const follow = screen.getByRole("button", { name: "Follow author" });
      await waitFor(() => expect(follow).toBeEnabled());
      await act(async () => follow.click());
      const next = {
        ...bingo,
        id: "next-board",
        title: "Next board",
        current_revision: { ...bingo.current_revision!, title: "Next board" },
        author: { ...bingo.author, id: "next-author", username: "next-author" },
      };
      mocks.getBingo.mockResolvedValue(next);
      mocks.getProfile.mockResolvedValue({ ...authorProfile, ...next.author });
      view.rerender(<BingoPlayer bingoId={next.id} />);
      await screen.findByRole("heading", { name: "Next board" });
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Follow author" })).toBeEnabled(),
      );
      await act(async () => {
        if (outcome === "success") resolveFollow();
        else rejectFollow(new Error("Old follow failed"));
      });
      expect(screen.getByRole("button", { name: "Follow author" })).toBeEnabled();
      expect(screen.queryByText("Old follow failed")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Following" })).not.toBeInTheDocument();
    },
  );

  it.each(["archive", "restore", "delete"] as const)(
    "ignores an old %s completion after loading the next board",
    async (action) => {
      let resolveManage!: (value?: unknown) => void;
      const request =
        action === "archive" ? mocks.archive : action === "restore" ? mocks.restore : mocks.remove;
      request.mockReturnValue(
        new Promise((resolve) => {
          resolveManage = resolve;
        }),
      );
      const editable: BingoDetail = {
        ...bingo,
        status: action === "restore" ? "archived" : "published",
        permissions: { ...bingo.permissions, can_edit: true },
      };
      const view = render(
        <BingoPlayer bingoId={editable.id} initialBingo={editable} initialViewer={viewer} />,
      );
      const manage = screen.getByRole("button", {
        name: action === "archive" ? "Archive" : action === "restore" ? "Restore" : "Delete",
      });
      await waitFor(() => expect(manage).toBeEnabled());
      await act(async () => {
        manage.click();
        manage.click();
      });
      expect(request).toHaveBeenCalledOnce();
      const next = {
        ...bingo,
        id: "next-board",
        title: "Next board",
        current_revision: { ...bingo.current_revision!, title: "Next board" },
      };
      mocks.getBingo.mockResolvedValue(next);
      view.rerender(<BingoPlayer bingoId={next.id} />);
      await screen.findByRole("heading", { name: "Next board" });
      await act(async () =>
        resolveManage({ ...editable, status: action === "archive" ? "archived" : "published" }),
      );
      expect(screen.getByRole("heading", { name: "Next board" })).toBeVisible();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    },
  );

  it("unlocks follow after a failure and supports follow then unfollow", async () => {
    mocks.getProfile.mockResolvedValue(authorProfile);
    mocks.follow.mockRejectedValueOnce(new Error("Follow is temporarily unavailable"));
    mocks.follow.mockResolvedValueOnce(undefined);
    mocks.unfollow.mockResolvedValue(undefined);
    render(
      <BingoPlayer
        bingoId={bingo.id}
        initialBingo={bingo}
        initialViewer={viewer}
        initialAuthorProfile={authorProfile}
      />,
    );
    const follow = screen.getByRole("button", { name: "Follow author" });
    await waitFor(() => expect(follow).toBeEnabled());
    await act(async () => follow.click());
    expect(screen.getByText("Follow is temporarily unavailable")).toBeVisible();
    expect(follow).toBeEnabled();
    await act(async () => follow.click());
    const following = screen.getByRole("button", { name: "Following" });
    expect(following).toBeEnabled();
    await act(async () => following.click());
    expect(screen.getByRole("button", { name: "Follow author" })).toBeEnabled();
    expect(mocks.follow).toHaveBeenCalledTimes(2);
    expect(mocks.unfollow).toHaveBeenCalledOnce();
  });
});
