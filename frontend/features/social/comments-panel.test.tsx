import { act, fireEvent, render, screen } from "@testing-library/react";
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
  deletion_scheduled_for: null,
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
    vi.restoreAllMocks();
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

  it("locks the submitted text and synchronously prevents duplicate posts", async () => {
    let resolve: (comment: Comment) => void = () => undefined;
    mocks.create.mockReturnValue(
      new Promise<Comment>((done) => {
        resolve = done;
      }),
    );
    const user = userEvent.setup();
    render(<CommentsPanel bingoId="33333333-3333-4333-8333-333333333333" viewer={viewer} />);
    await screen.findByText("No comments yet");
    const input = screen.getByLabelText("Add a comment");
    await user.type(input, "Keep this exact comment 🎲");
    act(() => {
      fireEvent.submit(input.closest("form")!);
      fireEvent.submit(input.closest("form")!);
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
    await act(async () => {
      resolve(comment("Keep this exact comment 🎲"));
    });
    expect(input).toBeEnabled();
    expect(input).toHaveValue("");
  });

  it("preserves root text after a failed post and warns before navigation", async () => {
    mocks.create.mockRejectedValue(new Error("Comments are unavailable."));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<CommentsPanel bingoId="33333333-3333-4333-8333-333333333333" viewer={viewer} />);
    await screen.findByText("No comments yet");
    const input = screen.getByLabelText("Add a comment");
    await user.type(input, "A multiline comment{Enter}🎲 <literal> & text");
    await user.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("Comments are unavailable.")).toBeVisible();
    expect(input).toHaveValue("A multiline comment\n🎲 <literal> & text");
    expect(input).toBeEnabled();
    const anchor = document.createElement("a");
    anchor.href = "/explore";
    document.body.append(anchor);
    const navigation = new MouseEvent("click", { bubbles: true, cancelable: true });
    anchor.dispatchEvent(navigation);
    expect(navigation.defaultPrevented).toBe(true);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("unsent comment"));
    anchor.remove();
  });

  it("keeps an active reply and requires confirmation before switching or cancelling it", async () => {
    const first = comment("First parent");
    const second = { ...comment("Second parent"), id: "44444444-4444-4444-8444-444444444444" };
    mocks.list.mockResolvedValue({ ...emptyPage, count: 2, results: [first, second] });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<CommentsPanel bingoId="33333333-3333-4333-8333-333333333333" viewer={viewer} />);
    await screen.findByText("First parent");
    const triggers = screen.getAllByRole("button", { name: "Reply" });
    await user.click(triggers[0]!);
    await user.type(screen.getByLabelText("Reply", { exact: true }), "Unsent reply 🎲");
    await user.click(triggers[0]!);
    expect(screen.getByLabelText("Reply", { exact: true })).toHaveValue("Unsent reply 🎲");
    expect(confirm).not.toHaveBeenCalled();
    await user.click(triggers[1]!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Reply", { exact: true })).toHaveValue("Unsent reply 🎲");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Reply", { exact: true })).toHaveValue("Unsent reply 🎲");
    confirm.mockReturnValue(true);
    await user.click(triggers[1]!);
    expect(screen.getByLabelText("Reply", { exact: true })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Post reply" })).toBeDisabled();
  });

  it("does not show the previous comment page after a failed page change", async () => {
    mocks.list
      .mockResolvedValueOnce({
        ...emptyPage,
        count: 2,
        next: "?page=2",
        results: [comment("First page")],
      })
      .mockRejectedValueOnce(new Error("Comments are unavailable."))
      .mockResolvedValueOnce({
        ...emptyPage,
        count: 2,
        previous: "?page=1",
        results: [comment("Second page")],
      });
    const user = userEvent.setup();
    render(<CommentsPanel bingoId="33333333-3333-4333-8333-333333333333" viewer="guest" />);

    expect(await screen.findByText("First page")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Comments are unavailable.")).toBeVisible();
    expect(screen.queryByText("First page")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Second page")).toBeVisible();
    expect(screen.queryByText("Comments are unavailable.")).not.toBeInTheDocument();
  });

  it.each([
    [1, "View 1 reply"],
    [2, "View all 2 replies"],
  ])("uses the right reply label for %i replies", async (count, label) => {
    mocks.list.mockResolvedValue({
      ...emptyPage,
      count: 1,
      results: [{ ...comment("A parent comment"), reply_count: count }],
    });

    render(<CommentsPanel bingoId="33333333-3333-4333-8333-333333333333" viewer="guest" />);

    expect(await screen.findByRole("button", { name: label })).toBeVisible();
  });
});
