import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSocialDrafts,
  readCommentDraft,
  readInlineCommentDraft,
  rememberInlineCommentDraft,
} from "@/features/social/social-draft-cache";
import { CommentsPanel } from "@/features/social/comments-panel";
import type { AuthenticatedUser, Comment, Page } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  context: vi.fn(),
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
  fieldValidationMessage: (
    error: Error & { fieldErrors?: Record<string, string> },
    field: string,
  ) => error.fieldErrors?.[field] ?? null,
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
    clearSocialDrafts();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.list.mockResolvedValue(emptyPage);
    mocks.context.mockReset();
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

  it("restores a reply outside the list page and clears recovery after successful posting", async () => {
    const user = userEvent.setup();
    const bingoId = "33333333-3333-4333-8333-333333333333";
    const parent = comment("Original conversation");
    const saved = readInlineCommentDraft(viewer.id, bingoId, "reply");
    const body = "Reply 🎲\n<literal> & context";
    rememberInlineCommentDraft(
      viewer.id,
      bingoId,
      "reply",
      { kind: "reply", targetId: parent.id, body, page: 2 },
      saved.generation,
    );
    mocks.context.mockResolvedValue({ bingo_id: bingoId, comment: parent, parent: null });
    const created = {
      ...comment(body),
      id: "44444444-4444-4444-8444-444444444444",
      parent_id: parent.id,
    };
    mocks.reply.mockResolvedValue(created);
    render(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
    const input = await screen.findByLabelText("Reply", { exact: true });
    expect(input).toHaveValue(body);
    expect(screen.getByText("Original conversation")).toBeVisible();
    expect(mocks.list).toHaveBeenCalledWith(bingoId, 2, expect.any(AbortSignal));
    await user.click(screen.getByRole("button", { name: "Post reply" }));
    expect(mocks.reply).toHaveBeenCalledWith(parent.id, body);
    await waitFor(() =>
      expect(document.getElementById(`comment-${created.id}`)).toHaveTextContent(
        body.replaceAll("\n", " "),
      ),
    );
    await waitFor(() =>
      expect(readInlineCommentDraft(viewer.id, bingoId, "reply").draft).toBeUndefined(),
    );
  });

  it("recovers an edited nested reply with its parent and current server text", async () => {
    const user = userEvent.setup();
    const bingoId = "33333333-3333-4333-8333-333333333333";
    const parent = comment("Original parent context");
    const target = {
      ...comment("Newer text from another tab"),
      id: "44444444-4444-4444-8444-444444444444",
      parent_id: parent.id,
    };
    const saved = readInlineCommentDraft(viewer.id, bingoId, "edit");
    const body = "Unfinished edit 🎲\n<literal> & context";
    rememberInlineCommentDraft(
      viewer.id,
      bingoId,
      "edit",
      { kind: "edit", targetId: target.id, body, originalBody: "Older original text", page: 1 },
      saved.generation,
    );
    mocks.context.mockResolvedValue({ bingo_id: bingoId, comment: target, parent });
    mocks.update.mockResolvedValue({ ...target, body });
    render(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
    expect(await screen.findByLabelText("Edit comment", { exact: true })).toHaveValue(body);
    expect(screen.getByText("Original parent context")).toBeVisible();
    expect(screen.getByText(/This comment changed while you were editing/)).toHaveTextContent(
      target.body,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.update).toHaveBeenCalledWith(target.id, body);
    await waitFor(() =>
      expect(document.getElementById(`comment-${target.id}`)).toHaveTextContent(
        body.replaceAll("\n", " "),
      ),
    );
    await waitFor(() =>
      expect(readInlineCommentDraft(viewer.id, bingoId, "edit").draft).toBeUndefined(),
    );
  });

  it("retains copyable text when recovery fails and retries without changing its target", async () => {
    const user = userEvent.setup();
    const bingoId = "33333333-3333-4333-8333-333333333333";
    const parent = comment("Recovered original target");
    const saved = readInlineCommentDraft(viewer.id, bingoId, "reply");
    rememberInlineCommentDraft(
      viewer.id,
      bingoId,
      "reply",
      { kind: "reply", targetId: parent.id, body: "Keep my reply", page: 1 },
      saved.generation,
    );
    mocks.context.mockRejectedValueOnce(new Error("This conversation is unavailable."));
    render(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
    expect(await screen.findByLabelText("Recovered reply")).toHaveValue("Keep my reply");
    expect(await screen.findByRole("alert")).toHaveTextContent("Your draft is retained");
    expect(screen.queryByRole("button", { name: "Post reply" })).not.toBeInTheDocument();
    mocks.context.mockResolvedValueOnce({ bingo_id: bingoId, comment: parent, parent: null });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText("Reply", { exact: true })).toHaveValue("Keep my reply");
    expect(mocks.context).toHaveBeenLastCalledWith(parent.id, expect.any(AbortSignal));
    expect(mocks.reply).not.toHaveBeenCalled();
  });

  it.each(["reply", "edit"] as const)(
    "retains %s text for a deleted comment and disables sending",
    async (kind) => {
      const user = userEvent.setup();
      const bingoId = "33333333-3333-4333-8333-333333333333";
      const target = { ...comment("[deleted]"), deleted_at: "2026-10-03T00:00:00Z" };
      const saved = readInlineCommentDraft(viewer.id, bingoId, kind);
      rememberInlineCommentDraft(
        viewer.id,
        bingoId,
        kind,
        kind === "reply"
          ? { kind, targetId: target.id, body: "Retain this private text", page: 1 }
          : {
              kind,
              targetId: target.id,
              body: "Retain this private text",
              originalBody: "Original text",
              page: 1,
            },
        saved.generation,
      );
      mocks.context.mockResolvedValue({ bingo_id: bingoId, comment: target, parent: null });
      render(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
      expect(
        await screen.findByLabelText(kind === "reply" ? "Reply" : "Edit comment", { exact: true }),
      ).toHaveValue("Retain this private text");
      expect(
        screen.getByRole("button", { name: kind === "reply" ? "Post reply" : "Save" }),
      ).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent("This comment was deleted");
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(readInlineCommentDraft(viewer.id, bingoId, kind).draft).toBeUndefined();
    },
  );

  it("rejects a context from a different board instead of presenting its contents", async () => {
    const bingoId = "33333333-3333-4333-8333-333333333333";
    const target = comment("Do not show wrong-board context");
    const saved = readInlineCommentDraft(viewer.id, bingoId, "edit");
    rememberInlineCommentDraft(
      viewer.id,
      bingoId,
      "edit",
      {
        kind: "edit",
        targetId: target.id,
        body: "Retained own text",
        originalBody: "Original",
        page: 1,
      },
      saved.generation,
    );
    mocks.context.mockResolvedValue({ bingo_id: "another-board", comment: target, parent: null });
    render(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer available");
    expect(screen.getByLabelText("Recovered comment changes")).toHaveValue("Retained own text");
    expect(screen.queryByText(target.body)).not.toBeInTheDocument();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns to the first comment page when a saved page no longer exists without losing the draft", async () => {
    const bingoId = "33333333-3333-4333-8333-333333333333";
    const target = comment("Original text");
    const saved = readInlineCommentDraft(viewer.id, bingoId, "edit");
    rememberInlineCommentDraft(
      viewer.id,
      bingoId,
      "edit",
      {
        kind: "edit",
        targetId: target.id,
        body: "Keep this edit",
        originalBody: target.body,
        page: 9,
      },
      saved.generation,
    );
    mocks.list
      .mockRejectedValueOnce(Object.assign(new Error("Page no longer exists."), { status: 404 }))
      .mockResolvedValue(emptyPage);
    mocks.context.mockResolvedValue({ bingo_id: bingoId, comment: target, parent: null });
    render(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
    await waitFor(() =>
      expect(mocks.list).toHaveBeenCalledWith(bingoId, 1, expect.any(AbortSignal)),
    );
    expect(await screen.findByLabelText("Edit comment", { exact: true })).toHaveValue(
      "Keep this edit",
    );
    expect(screen.queryByText("No comments yet")).not.toBeInTheDocument();
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

  it("restores unsent root text only for the same account and board", async () => {
    const user = userEvent.setup();
    const bingoId = "33333333-3333-4333-8333-333333333333";
    const view = render(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
    await screen.findByText("No comments yet");
    await user.type(
      screen.getByLabelText("Add a comment"),
      "Keep my draft 🎲{Enter}<literal> & context",
    );
    view.rerender(<CommentsPanel bingoId={bingoId} viewer="guest" />);
    await screen.findByText("No comments yet");
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    view.rerender(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
    expect(await screen.findByLabelText("Add a comment")).toHaveValue(
      "Keep my draft 🎲\n<literal> & context",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Unsent comment restored");
    view.rerender(
      <CommentsPanel
        bingoId={bingoId}
        viewer={{ ...viewer, id: "44444444-4444-4444-8444-444444444444" }}
      />,
    );
    expect(await screen.findByLabelText("Add a comment")).toHaveValue("");
    view.rerender(<CommentsPanel bingoId={bingoId} viewer={viewer} />);
    expect(await screen.findByLabelText("Add a comment")).toHaveValue("");
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
    expect(readCommentDraft(viewer.id, "33333333-3333-4333-8333-333333333333").body).toBe("");
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

  it.each([
    ["root", "create", "Add a comment", "Post comment"],
    ["reply", "reply", "Reply", "Post reply"],
    ["edit", "update", "Edit comment", "Save"],
  ] as const)(
    "identifies and focuses the body validation field (%s)",
    async (kind, method, label, button) => {
      const message = "Please shorten this comment.";
      mocks[method].mockRejectedValue(
        Object.assign(new Error("Validation failed."), { fieldErrors: { body: message } }),
      );
      if (kind !== "root")
        mocks.list.mockResolvedValue({
          ...emptyPage,
          count: 1,
          results: [comment("Original parent")],
        });
      const user = userEvent.setup();
      render(<CommentsPanel bingoId="33333333-3333-4333-8333-333333333333" viewer={viewer} />);
      if (kind === "root") await screen.findByText("No comments yet");
      else {
        await screen.findByText("Original parent");
        await user.click(screen.getByRole("button", { name: kind === "reply" ? "Reply" : "Edit" }));
      }
      const input = screen.getByLabelText(label, { exact: true });
      await user.clear(input);
      await user.type(input, "Keep this entered text 🎲");
      await user.click(screen.getByRole("button", { name: button }));
      expect(await screen.findByText(message)).toBeVisible();
      await waitFor(() => expect(input).toHaveFocus());
      expect(input).toBeEnabled();
      expect(input).toHaveValue("Keep this entered text 🎲");
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAccessibleDescription(expect.stringContaining(message));
      await user.type(input, "x");
      expect(input).toHaveAttribute("aria-invalid", "false");
      expect(screen.queryByText(message)).not.toBeInTheDocument();
    },
  );

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
