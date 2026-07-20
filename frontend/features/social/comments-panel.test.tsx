import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommentsPanel } from "@/features/social/comments-panel";
import type { AuthenticatedUser, Comment, Page } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  replies: vi.fn(),
  reply: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  like: vi.fn(),
  unlike: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  api: {
    comments: mocks,
    reports: { create: vi.fn() },
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
}));

const emptyPage: Page<Comment> = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

const viewer: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "reader",
  display_name: "Reader",
  avatar: null,
  email: "reader@example.test",
  email_verified: true,
};

function comment(body: string): Comment {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    author: viewer,
    body,
    parent_id: null,
    like_count: 0,
    reply_count: 0,
    is_liked: false,
    replies: [],
    edited_at: null,
    deleted_at: null,
    created_at: "2026-07-20T00:00:00Z",
  };
}

describe("CommentsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue(emptyPage);
  });

  it("lets guests read the thread but directs them to login to comment", async () => {
    render(<CommentsPanel bingoId="33333333-3333-4333-8333-333333333333" viewer="guest" />);

    expect(await screen.findByText("No comments yet")).toBeVisible();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
      "href",
      expect.stringContaining("/login?next="),
    );
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });

  it("posts a signed-in user's root comment through the social API", async () => {
    const created = comment("A useful comment");
    mocks.create.mockResolvedValue(created);
    const user = userEvent.setup();
    render(<CommentsPanel bingoId="33333333-3333-4333-8333-333333333333" viewer={viewer} />);

    await screen.findByText("No comments yet");
    await user.type(screen.getByLabelText("Add a comment"), created.body);
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    expect(mocks.create).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333", created.body);
    expect(await screen.findByText(created.body)).toBeVisible();
  });
});
