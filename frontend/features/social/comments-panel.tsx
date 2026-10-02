"use client";

import Link from "next/link";
import { AuthLink } from "@/components/auth/auth-link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { ReportDialog } from "@/features/social/report-dialog";
import { api, errorMessage, fieldValidationMessage } from "@/lib/api/client";
import type { AuthenticatedUser, Comment, Page, PublicId } from "@/lib/api/types";
import { formatLocalDateTime } from "@/lib/date-time";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

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
  const [bodyErrors, setBodyErrors] = useState<Partial<Record<"root" | "reply" | "edit", string>>>(
    {},
  );
  const [replyingTo, setReplyingTo] = useState<PublicId | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editing, setEditing] = useState<PublicId | null>(null);
  const [editBody, setEditBody] = useState("");
  const [originalEditBody, setOriginalEditBody] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const actionInFlight = useRef(false);
  const validationFocus = useRef<HTMLTextAreaElement | null>(null);
  const [reporting, setReporting] = useState<Comment | null>(null);
  const signedIn = viewer !== "guest";
  const replyDirty = Boolean(replyingTo && replyBody.trim());
  const editDirty = Boolean(editing && editBody !== originalEditBody);
  useUnsavedChangesWarning(
    Boolean(newBody.trim()) || replyDirty || editDirty,
    "You have unsent comment text. Leave and discard it?",
  );

  useEffect(() => {
    if (pendingAction || !validationFocus.current) return;
    validationFocus.current.focus();
    validationFocus.current = null;
  }, [pendingAction, bodyErrors]);

  function beginAction(action: string) {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    setPendingAction(action);
    setError("");
    return true;
  }

  function finishAction() {
    actionInFlight.current = false;
    setPendingAction("");
  }

  function showBodyError(caught: unknown, kind: "root" | "reply" | "edit", form: HTMLFormElement) {
    const message = fieldValidationMessage(caught, "body");
    if (!message) {
      setError(errorMessage(caught));
      return;
    }
    validationFocus.current = form.querySelector<HTMLTextAreaElement>("textarea");
    setBodyErrors((current) => ({ ...current, [kind]: message }));
  }

  function discardReply() {
    return !replyDirty || window.confirm("Discard your unsent reply?");
  }

  function discardEdit() {
    return !editDirty || window.confirm("Discard your unsaved comment changes?");
  }

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        setResult(await api.comments.list(bingoId, page, signal));
      } catch (caught) {
        if (!signal?.aborted) {
          setResult(null);
          setError(errorMessage(caught));
        }
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
    const form = event.currentTarget;
    const body = newBody.trim();
    if (!body || !beginAction("create")) return;
    setBodyErrors((current) => ({ ...current, root: undefined }));
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
      showBodyError(caught, "root", form);
    } finally {
      finishAction();
    }
  }

  async function createReply(event: FormEvent<HTMLFormElement>, parentId: PublicId) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = replyBody.trim();
    if (!body || !beginAction(`reply-${parentId}`)) return;
    setBodyErrors((current) => ({ ...current, reply: undefined }));
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
      showBodyError(caught, "reply", form);
    } finally {
      finishAction();
    }
  }

  async function loadReplies(parentId: PublicId) {
    if (!beginAction(`load-${parentId}`)) return;
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
      finishAction();
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, commentId: PublicId) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = editBody.trim();
    if (!body || !beginAction(`edit-${commentId}`)) return;
    setBodyErrors((current) => ({ ...current, edit: undefined }));
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
      showBodyError(caught, "edit", form);
    } finally {
      finishAction();
    }
  }

  async function removeComment(commentId: PublicId) {
    if (
      actionInFlight.current ||
      !window.confirm("Delete this comment? Replies will remain visible.")
    ) {
      return;
    }
    if (!beginAction(`delete-${commentId}`)) return;
    try {
      await api.comments.remove(commentId);
      updateComment(commentId, (comment) => ({
        ...comment,
        body: "This comment has been deleted.",
        deleted_at: new Date().toISOString(),
        is_liked: false,
      }));
      if (editing === commentId) {
        setEditing(null);
        setEditBody("");
      }
      window.setTimeout(() => document.getElementById(`comment-${commentId}`)?.focus(), 0);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      finishAction();
    }
  }

  async function toggleLike(comment: Comment) {
    if (!signedIn || comment.deleted_at || !beginAction(`like-${comment.id}`)) return;
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
      finishAction();
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
          <time dateTime={comment.created_at}>{formatLocalDateTime(comment.created_at)}</time>
        </header>
        {isEditing ? (
          <form className="comment-form" onSubmit={(event) => void saveEdit(event, comment.id)}>
            <label className="field">
              <span id={`edit-comment-label-${comment.id}`} className="sr-only">
                Edit comment
              </span>
              <textarea
                aria-labelledby={`edit-comment-label-${comment.id}`}
                aria-invalid={Boolean(bodyErrors.edit)}
                aria-describedby={[
                  `edit-comment-hint-${comment.id}`,
                  bodyErrors.edit ? `edit-comment-error-${comment.id}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                name="edited_comment"
                autoComplete="off"
                rows={3}
                maxLength={2_000}
                required
                autoFocus
                disabled={pendingAction === `edit-${comment.id}`}
                value={editBody}
                onChange={(event) => {
                  setEditBody(event.target.value);
                  setBodyErrors((current) => ({ ...current, edit: undefined }));
                }}
              />
              <small id={`edit-comment-hint-${comment.id}`}>
                Required. Up to 2,000 characters.
              </small>
              {bodyErrors.edit ? (
                <small
                  id={`edit-comment-error-${comment.id}`}
                  className="form-message--error"
                  role="alert"
                >
                  {bodyErrors.edit}
                </small>
              ) : null}
            </label>
            <div className="inline-actions">
              <button
                type="button"
                className="button button--secondary"
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  if (actionInFlight.current || !discardEdit()) return;
                  setEditing(null);
                  setEditBody("");
                  restoreActionFocus(comment.id, "edit");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={Boolean(pendingAction) || !editBody.trim()}
              >
                {pendingAction === `edit-${comment.id}` ? "Saving…" : "Save"}
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
              disabled={Boolean(pendingAction)}
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
              disabled={Boolean(pendingAction)}
              onClick={() => {
                if (actionInFlight.current || replyingTo === comment.id || !discardReply()) return;
                setBodyErrors((current) => ({ ...current, reply: undefined }));
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
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  if (actionInFlight.current || editing === comment.id || !discardEdit()) return;
                  setBodyErrors((current) => ({ ...current, edit: undefined }));
                  setEditing(comment.id);
                  setEditBody(comment.body);
                  setOriginalEditBody(comment.body);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-button"
                disabled={Boolean(pendingAction)}
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
              <span id={`reply-label-${comment.id}`}>Reply</span>
              <textarea
                aria-labelledby={`reply-label-${comment.id}`}
                aria-invalid={Boolean(bodyErrors.reply)}
                aria-describedby={[
                  `reply-hint-${comment.id}`,
                  bodyErrors.reply ? `reply-error-${comment.id}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                name="reply_body"
                autoComplete="off"
                rows={3}
                maxLength={2_000}
                required
                autoFocus
                disabled={pendingAction === `reply-${comment.id}`}
                value={replyBody}
                onChange={(event) => {
                  setReplyBody(event.target.value);
                  setBodyErrors((current) => ({ ...current, reply: undefined }));
                }}
              />
              <small id={`reply-hint-${comment.id}`}>Required. Up to 2,000 characters.</small>
              {bodyErrors.reply ? (
                <small
                  id={`reply-error-${comment.id}`}
                  className="form-message--error"
                  role="alert"
                >
                  {bodyErrors.reply}
                </small>
              ) : null}
            </label>
            <div className="inline-actions">
              <button
                type="button"
                className="button button--secondary"
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  if (actionInFlight.current || !discardReply()) return;
                  setReplyingTo(null);
                  setReplyBody("");
                  restoreActionFocus(comment.id, "reply");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={Boolean(pendingAction) || !replyBody.trim()}
              >
                {pendingAction === `reply-${comment.id}` ? "Posting reply…" : "Post reply"}
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
              : `View ${comment.reply_count === 1 ? "1 reply" : `all ${comment.reply_count} replies`}`}
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

      {signedIn && (!loading || result !== null) ? (
        <form className="comment-form comment-form--root" onSubmit={createRoot}>
          <label className="field">
            <span id={`comment-label-${bingoId}`}>Add a comment</span>
            <textarea
              aria-labelledby={`comment-label-${bingoId}`}
              aria-invalid={Boolean(bodyErrors.root)}
              aria-describedby={[
                `comment-hint-${bingoId}`,
                bodyErrors.root ? `comment-error-${bingoId}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
              name="comment_body"
              autoComplete="off"
              rows={3}
              maxLength={2_000}
              required
              disabled={pendingAction === "create"}
              value={newBody}
              onChange={(event) => {
                setNewBody(event.target.value);
                setBodyErrors((current) => ({ ...current, root: undefined }));
              }}
            />
            <small id={`comment-hint-${bingoId}`}>Required. Up to 2,000 characters.</small>
            {bodyErrors.root ? (
              <small id={`comment-error-${bingoId}`} className="form-message--error" role="alert">
                {bodyErrors.root}
              </small>
            ) : null}
          </label>
          <button
            type="submit"
            className="button button--primary"
            disabled={Boolean(pendingAction) || !newBody.trim()}
          >
            {pendingAction === "create" ? "Posting…" : "Post comment"}
          </button>
        </form>
      ) : !signedIn ? (
        <p className="comments-sign-in">
          <AuthLink href={`/login?next=${encodeURIComponent(`/bingo/${bingoId}#comments`)}`}>
            Log in
          </AuthLink>{" "}
          to join the conversation. Reading comments is public.
        </p>
      ) : null}

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
            disabled={!result.previous || loading || Boolean(pendingAction)}
            onClick={() => {
              if (!discardReply() || !discardEdit()) return;
              setReplyingTo(null);
              setReplyBody("");
              setEditing(null);
              setEditBody("");
              setResult(null);
              setPage((value) => Math.max(1, value - 1));
            }}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.next || loading || Boolean(pendingAction)}
            onClick={() => {
              if (!discardReply() || !discardEdit()) return;
              setReplyingTo(null);
              setReplyBody("");
              setEditing(null);
              setEditBody("");
              setResult(null);
              setPage((value) => value + 1);
            }}
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
