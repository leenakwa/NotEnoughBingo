"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { ReportDialog } from "@/features/social/report-dialog";
import { api, errorMessage } from "@/lib/api/client";
import type { AuthenticatedUser, Comment, Page, PublicId } from "@/lib/api/types";

type Viewer = AuthenticatedUser | "guest";

function updateCommentTree(
  comments: Comment[],
  commentId: PublicId,
  update: (comment: Comment) => Comment,
): Comment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) return update(comment);
    if (comment.replies.some((reply) => reply.id === commentId)) {
      return {
        ...comment,
        replies: comment.replies.map((reply) => (reply.id === commentId ? update(reply) : reply)),
      };
    }
    return comment;
  });
}

export function CommentsPanel({ bingoId, viewer }: { bingoId: PublicId; viewer: Viewer }) {
  const [result, setResult] = useState<Page<Comment> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newBody, setNewBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<PublicId | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editing, setEditing] = useState<PublicId | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [reporting, setReporting] = useState<Comment | null>(null);
  const signedIn = viewer !== "guest";

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        setResult(await api.comments.list(bingoId, page, signal));
      } catch (caught) {
        if (!signal?.aborted) setError(errorMessage(caught));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [bingoId, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  function updateComment(commentId: PublicId, update: (comment: Comment) => Comment) {
    setResult((current) =>
      current
        ? {
            ...current,
            results: updateCommentTree(current.results, commentId, update),
          }
        : current,
    );
  }

  function restoreActionFocus(commentId: PublicId, action: "reply" | "edit") {
    window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-comment-action="${action}-${commentId}"]`)
        ?.focus();
    }, 0);
  }

  async function createRoot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = newBody.trim();
    if (!body || pendingAction) return;
    setPendingAction("create");
    setError("");
    try {
      const created = await api.comments.create(bingoId, body);
      setResult((current) =>
        current
          ? {
              ...current,
              count: current.count + 1,
              results: [created, ...current.results],
            }
          : {
              count: 1,
              next: null,
              previous: null,
              results: [created],
            },
      );
      setNewBody("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction("");
    }
  }

  async function createReply(event: FormEvent<HTMLFormElement>, parentId: PublicId) {
    event.preventDefault();
    const body = replyBody.trim();
    if (!body || pendingAction) return;
    setPendingAction(`reply-${parentId}`);
    setError("");
    try {
      const created = await api.comments.reply(parentId, body);
      updateComment(parentId, (comment) => ({
        ...comment,
        reply_count: comment.reply_count + 1,
        replies: [...comment.replies, created],
      }));
      setReplyBody("");
      setReplyingTo(null);
      restoreActionFocus(parentId, "reply");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction("");
    }
  }

  async function loadReplies(parentId: PublicId) {
    if (pendingAction) return;
    setPendingAction(`load-${parentId}`);
    setError("");
    try {
      const replies: Comment[] = [];
      let replyPage = 1;
      let loaded = await api.comments.replies(parentId, replyPage);
      replies.push(...loaded.results);
      while (loaded.next && replyPage < 10) {
        replyPage += 1;
        loaded = await api.comments.replies(parentId, replyPage);
        replies.push(...loaded.results);
      }
      updateComment(parentId, (comment) => ({
        ...comment,
        replies,
      }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction("");
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, commentId: PublicId) {
    event.preventDefault();
    const body = editBody.trim();
    if (!body || pendingAction) return;
    setPendingAction(`edit-${commentId}`);
    setError("");
    try {
      const updated = await api.comments.update(commentId, body);
      updateComment(commentId, (current) => ({
        ...updated,
        replies: current.replies,
        reply_count: current.reply_count,
      }));
      setEditing(null);
      setEditBody("");
      restoreActionFocus(commentId, "edit");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction("");
    }
  }

  async function removeComment(commentId: PublicId) {
    if (pendingAction || !window.confirm("Delete this comment? Replies will remain visible.")) {
      return;
    }
    setPendingAction(`delete-${commentId}`);
    setError("");
    try {
      await api.comments.remove(commentId);
      updateComment(commentId, (comment) => ({
        ...comment,
        body: "This comment has been deleted.",
        deleted_at: new Date().toISOString(),
        is_liked: false,
      }));
      window.setTimeout(() => document.getElementById(`comment-${commentId}`)?.focus(), 0);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction("");
    }
  }

  async function toggleLike(comment: Comment) {
    if (!signedIn || pendingAction || comment.deleted_at) return;
    setPendingAction(`like-${comment.id}`);
    setError("");
    try {
      if (comment.is_liked) await api.comments.unlike(comment.id);
      else await api.comments.like(comment.id);
      updateComment(comment.id, (current) => ({
        ...current,
        is_liked: !current.is_liked,
        like_count: Math.max(0, current.like_count + (current.is_liked ? -1 : 1)),
      }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPendingAction("");
    }
  }

  function renderComment(comment: Comment, reply = false) {
    const own = signedIn && viewer.id === comment.author.id;
    const isEditing = editing === comment.id;
    return (
      <article
        key={comment.id}
        id={`comment-${comment.id}`}
        tabIndex={-1}
        className={reply ? "comment comment--reply" : "comment"}
      >
        <header className="comment__header">
          <Link href={`/profile/${comment.author.username}`}>
            {comment.author.display_name || `@${comment.author.username}`}
          </Link>
          <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString()}</time>
        </header>
        {isEditing ? (
          <form className="comment-form" onSubmit={(event) => void saveEdit(event, comment.id)}>
            <label className="field">
              <span className="sr-only">Edit comment</span>
              <textarea
                rows={3}
                maxLength={2_000}
                required
                autoFocus
                value={editBody}
                onChange={(event) => setEditBody(event.target.value)}
              />
            </label>
            <div className="inline-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setEditing(null);
                  restoreActionFocus(comment.id, "edit");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={pendingAction === `edit-${comment.id}`}
              >
                Save
              </button>
            </div>
          </form>
        ) : (
          <p className={comment.deleted_at ? "comment__body is-deleted" : "comment__body"}>
            {comment.body}
            {comment.edited_at && !comment.deleted_at ? <small> (edited)</small> : null}
          </p>
        )}
        <div className="comment__actions">
          {signedIn && !comment.deleted_at ? (
            <button
              type="button"
              className="text-button"
              aria-pressed={comment.is_liked}
              disabled={pendingAction === `like-${comment.id}`}
              onClick={() => void toggleLike(comment)}
            >
              {comment.is_liked ? "Unlike" : "Like"} · {comment.like_count}
            </button>
          ) : (
            <span>{comment.like_count} likes</span>
          )}
          {!reply && signedIn && !comment.deleted_at ? (
            <button
              type="button"
              className="text-button"
              data-comment-action={`reply-${comment.id}`}
              onClick={() => {
                setReplyingTo(comment.id);
                setReplyBody("");
              }}
            >
              Reply
            </button>
          ) : null}
          {own && !comment.deleted_at ? (
            <>
              <button
                type="button"
                className="text-button"
                data-comment-action={`edit-${comment.id}`}
                onClick={() => {
                  setEditing(comment.id);
                  setEditBody(comment.body);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-button"
                disabled={pendingAction === `delete-${comment.id}`}
                onClick={() => void removeComment(comment.id)}
              >
                Delete
              </button>
            </>
          ) : null}
          {signedIn && !own && !comment.deleted_at ? (
            <button type="button" className="text-button" onClick={() => setReporting(comment)}>
              Report
            </button>
          ) : null}
        </div>
        {!reply && replyingTo === comment.id ? (
          <form
            className="comment-form comment-form--reply"
            onSubmit={(event) => void createReply(event, comment.id)}
          >
            <label className="field">
              <span>Reply</span>
              <textarea
                rows={3}
                maxLength={2_000}
                required
                autoFocus
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
              />
            </label>
            <div className="inline-actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => {
                  setReplyingTo(null);
                  restoreActionFocus(comment.id, "reply");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={pendingAction === `reply-${comment.id}`}
              >
                Post reply
              </button>
            </div>
          </form>
        ) : null}
        {!reply && comment.replies.length ? (
          <div className="comment__replies">
            {comment.replies.map((item) => renderComment(item, true))}
          </div>
        ) : null}
        {!reply && comment.reply_count > comment.replies.length ? (
          <button
            type="button"
            className="text-button comment__more"
            disabled={pendingAction === `load-${comment.id}`}
            onClick={() => void loadReplies(comment.id)}
          >
            {pendingAction === `load-${comment.id}`
              ? "Loading replies…"
              : `View all ${comment.reply_count} replies`}
          </button>
        ) : null}
      </article>
    );
  }

  return (
    <section id="comments" className="comments-panel" aria-labelledby="comments-title">
      <header className="comments-panel__heading">
        <div>
          <p className="eyebrow">Conversation</p>
          <h2 id="comments-title">Comments</h2>
        </div>
        {result ? <span>{result.count} total</span> : null}
      </header>

      {signedIn ? (
        <form className="comment-form comment-form--root" onSubmit={createRoot}>
          <label className="field">
            <span>Add a comment</span>
            <textarea
              rows={3}
              maxLength={2_000}
              required
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className="button button--primary"
            disabled={pendingAction === "create" || !newBody.trim()}
          >
            {pendingAction === "create" ? "Posting…" : "Post comment"}
          </button>
        </form>
      ) : (
        <p className="comments-sign-in">
          <Link href={`/login?next=${encodeURIComponent(`/bingo/${bingoId}#comments`)}`}>
            Log in
          </Link>{" "}
          to join the conversation. Reading comments is public.
        </p>
      )}

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {loading && !result ? <LoadingState label="Loading comments…" /> : null}
      {!loading && !error && result?.results.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description="Start a useful, respectful conversation about this bingo."
        />
      ) : null}
      {result?.results.length ? (
        <div className="comment-list">{result.results.map((item) => renderComment(item))}</div>
      ) : null}
      {result && (result.previous || result.next) ? (
        <nav className="pagination" aria-label="Comment pages">
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.previous || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.next || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
      {reporting ? (
        <ReportDialog
          targetType="comment"
          targetId={reporting.id}
          targetLabel="comment"
          onClose={() => setReporting(null)}
        />
      ) : null}
    </section>
  );
}
