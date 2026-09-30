import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BingoPlayer } from "@/features/play/bingo-player";
import type { AuthenticatedUser, BingoDetail, PlayProgress } from "@/lib/api/types";
import { readGuestProgress, writeGuestProgress } from "@/lib/guest-progress";

const mocks = vi.hoisted(() => ({
  getBingo: vi.fn(),
  getProfile: vi.fn(),
  getViewer: vi.fn(),
  getProgress: vi.fn(),
  saveProgress: vi.fn(),
  resetProgress: vi.fn(),
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
    bingos: { get: mocks.getBingo },
    profiles: { get: mocks.getProfile },
    progress: {
      get: mocks.getProgress,
      save: mocks.saveProgress,
      reset: mocks.resetProgress,
    },
  },
  ApiClientError: class extends Error {
    status = 500;
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
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
    vi.clearAllMocks();
    mocks.getBingo.mockResolvedValue(bingo);
    mocks.getViewer.mockResolvedValue(viewer);
    mocks.getProgress.mockResolvedValue(progress);
    mocks.getProfile.mockRejectedValue(new Error("Profile is optional here"));
  });
  afterEach(() => vi.restoreAllMocks());

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
    expect(screen.getByRole("button", { name: "Reset" })).toBeVisible();
    await act(() => Promise.resolve());
    expect(mocks.getViewer).not.toHaveBeenCalled();
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

  it("restores selected cells when a registered reset fails offline", async () => {
    mocks.getProgress.mockResolvedValue({
      ...progress,
      selected_cells: [bingo.current_revision!.cells[0]!.id],
    });
    mocks.resetProgress.mockRejectedValueOnce(new Error("Unable to reach the service"));
    render(<BingoPlayer bingoId={bingo.id} />);

    const cell = await screen.findByRole("button", { name: "Open the board, selected" });
    expect(cell).toHaveAttribute("aria-pressed", "true");
    await act(async () => {
      screen.getByRole("button", { name: "Reset" }).click();
      await Promise.resolve();
    });

    expect(await screen.findByText("Unable to reach the service")).toBeVisible();
    expect(cell).toHaveAttribute("aria-pressed", "true");
    expect(mocks.track).not.toHaveBeenCalledWith("reset", expect.anything());
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
});
