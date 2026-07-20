import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BingoPlayer } from "@/features/play/bingo-player";
import type { AuthenticatedUser, BingoDetail, PlayProgress } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  getBingo: vi.fn(),
  getProfile: vi.fn(),
  getViewer: vi.fn(),
  getProgress: vi.fn(),
  saveProgress: vi.fn(),
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
    auth: { me: mocks.getViewer },
    bingos: { get: mocks.getBingo },
    profiles: { get: mocks.getProfile },
    progress: {
      get: mocks.getProgress,
      save: mocks.saveProgress,
      reset: vi.fn(),
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
};

const bingo: BingoDetail = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Hydration safety",
  description: "",
  author: {
    id: "33333333-3333-4333-8333-333333333333",
    username: "author",
    display_name: "Author",
    avatar: null,
  },
  cover: null,
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

  it("does not write progress merely because server state was hydrated", async () => {
    render(<BingoPlayer bingoId={bingo.id} />);

    expect(await screen.findByRole("heading", { name: bingo.title })).toBeVisible();
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 450)));

    expect(mocks.getProgress).toHaveBeenCalledWith(bingo.id);
    expect(mocks.saveProgress).not.toHaveBeenCalled();
  });
});
