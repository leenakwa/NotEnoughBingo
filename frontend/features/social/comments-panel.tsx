"use client";

import Link from "next/link";
import { AuthLink } from "@/components/auth/auth-link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import {
  readCommentDraft,
  readInlineCommentDraft,
  rememberCommentDraft,
  rememberInlineCommentDraft,
} from "@/features/social/social-draft-cache";
import { ReportDialog } from "@/features/social/report-dialog";
import { api, errorMessage, fieldValidationMessage } from "@/lib/api/client";
import type { AuthenticatedUser, Comment, CommentContext, Page, PublicId } from "@/lib/api/types";
import { formatLocalDateTime } from "@/lib/date-time";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";

type Viewer = AuthenticatedUser | "guest";
type RecoveredContext =
  | { status: "loading" }
  | { status: "ready"; value: CommentContext }
  | { status: "error"; message: string };

function includeRecoveredContext(comments: Comment[], context: CommentContext): Comment[] {
  const root = context.parent ?? context.comment;
  if (!comments.some((comment) => comment.id === root.id)) {
    const replies =
      context.parent && !root.replies.some((reply) => reply.id === context.comment.id)
        ? [...root.replies, context.comment]
        : root.replies;
    return [{ ...root, replies }, ...comments];
  }
  if (!context.parent) return comments;
  return comments.map((comment) =>
    comment.id === root.id && !comment.replies.some((reply) => reply.id === context.comment.id)
      ? { ...comment, replies: [...comment.replies, context.comment] }
      : comment,
  );
}

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
  return (
    <CommentThread
      key={`${bingoId}:${viewer === "guest" ? "guest" : viewer.id}`}
      bingoId={bingoId}
      viewer={viewer}
    />
  );
}

function CommentThread({ bingoId, viewer }: { bingoId: PublicId; viewer: Viewer }) {
  const [result, setResult] = useState<Page<Comment> | null>(null);
  const [replyRecovery] = useState(() =>
    viewer === "guest" ? null : readInlineCommentDraft(viewer.id, bingoId, "reply"),
  );
  const [editRecovery] = useState(() =>
    viewer === "guest" ? null : readInlineCommentDraft(viewer.id, bingoId, "edit"),
  );
  const [page, setPage] = useState(replyRecovery?.draft?.page ?? editRecovery?.draft?.page ?? 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recovery] = useState(() =>
    viewer === "guest" ? null : readCommentDraft(viewer.id, bingoId),
  );
  const [newBody, setNewBody] = useState(recovery?.body ?? "");
  const [restored, setRestored] = useState(Boolean(recovery?.body));
  const [bodyErrors, setBodyErrors] = useState<Partial<Record<"root" | "reply" | "edit", string>>>(
    {},
  );
  const [replyingTo, setReplyingTo] = useState<PublicId | null>(
    replyRecovery?.draft?.targetId ?? null,
  );
  const [replyBody, setReplyBody] = useState(replyRecovery?.draft?.body ?? "");
  const [editing, setEditing] = useState<PublicId | null>(editRecovery?.draft?.targetId ?? null);
  const [editBody, setEditBody] = useState(editRecovery?.draft?.body ?? "");
  const [originalEditBody, setOriginalEditBody] = useState(
    editRecovery?.draft?.kind === "edit" ? editRecovery.draft.originalBody : "",
  );
  const [contexts, setContexts] = useState<Partial<Record<"reply" | "edit", RecoveredContext>>>(
    () => ({
      ...(replyRecovery?.draft ? { reply: { status: "loading" as const } } : {}),
      ...(editRecovery?.draft ? { edit: { status: "loading" as const } } : {}),
    }),
  );
  const [contextVersion, setContextVersion] = useState(0);
  const [restoreTargets, setRestoreTargets] = useState(() => ({
    reply: replyRecovery?.draft?.targetId,
    edit: editRecovery?.draft?.targetId,
  }));
  const [pendingAction, setPendingAction] = useState("");
  const actionInFlight = useRef(false);
  const validationFocus = useRef<HTMLTextAreaElement | null>(null);
  const [reporting, setReporting] = useState<Comment | null>(null);
  const signedIn = viewer !== "guest";
  const replyDirty = Boolean(replyingTo && replyBody.trim());
  const editDirty = Boolean(editing && editBody !== originalEditBody);
  useUnsavedChangesWarning(
    Boolean(newBody.trim()) || replyDirty || editDirty,
    "You have unsent comment text. Leave this page?",
  );

  useEffect(() => {
    if (pendingAction || !validationFocus.current) return;
    validationFocus.current.focus();
    validationFocus.current = null;
  }, [pendingAction, bodyErrors]);

  useEffect(() => {
    if (viewer !== "guest" && recovery) {
      rememberCommentDraft(viewer.id, bingoId, newBody, recovery.generation);
    }
  }, [bingoId, newBody, recovery, viewer]);

  useEffect(() => {
    if (viewer === "guest") return;
    if (replyRecovery)
      rememberInlineCommentDraft(
        viewer.id,
        bingoId,
        "reply",
        replyingTo ? { kind: "reply", targetId: replyingTo, body: replyBody, page } : null,
        replyRecovery.generation,
      );
    if (editRecovery)
      rememberInlineCommentDraft(
        viewer.id,
        bingoId,
        "edit",
        editing
          ? {
              kind: "edit",
              targetId: editing,
              body: editBody,
              originalBody: originalEditBody,
              page,
            }
          : null,
        editRecovery.generation,
      );
  }, [
    bingoId,
    viewer,
    replyRecovery,
    editRecovery,
    replyingTo,
    replyBody,
    editing,
    editBody,
    originalEditBody,
    page,
  ]);

  useEffect(() => {
    if (viewer === "guest") return;
    const controller = new AbortController();
    for (const [kind, saved] of [
      ["reply", replyRecovery],
      ["edit", editRecovery],
    ] as const) {
      if (!saved?.draft || restoreTargets[kind] !== saved.draft.targetId) continue;
      void api.comments
        .context(saved.draft.targetId, controller.signal)
        .then((value) => {
          if (controller.signal.aborted) return;
          if (
            value.bingo_id !== bingoId ||
            (kind === "reply" && value.comment.parent_id) ||
            (kind === "edit" && value.comment.author.id !== viewer.id)
          ) {
            throw new Error("This conversation is no longer available.");
          }
          setContexts((current) => ({ ...current, [kind]: { status: "ready", value } }));
        })
        .catch((caught) => {
          if (!controller.signal.aborted)
            setContexts((current) => ({
              ...current,
              [kind]: { status: "error", message: errorMessage(caught) },
            }));
        });
    }
    return () => controller.abort();
  }, [bingoId, viewer, replyRecovery, editRecovery, contextVersion, restoreTargets]);

  function contextReady(kind: "reply" | "edit", targetId: string) {
    return restoreTargets[kind] !== targetId || contexts[kind]?.status === "ready";
  }

  let displayedComments = result?.results ?? [];
  for (const kind of ["reply", "edit"] as const) {
    const context = contexts[kind];
    if (context?.status === "ready")
      displayedComments = includeRecoveredContext(displayedComments, context.value);
  }

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
          if (page > 1 && caught instanceof Error && "status" in caught && caught.status === 404) {
            setPage(1);
            return;
          }
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
    setContexts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([kind, context]) => [
          kind,
          context?.status === "ready"
            ? {
                ...context,
                value: {
                  ...context.value,
                  comment:
                    context.value.comment.id === commentId
                      ? update(context.value.comment)
                      : context.value.comment,
                  parent:
                    context.value.parent?.id === commentId
                      ? update(context.value.parent)
                      : context.value.parent,
                },
              }
            : context,
        ]),
      ),
    );
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
      setRestoreTargets((current) => ({ ...current, reply: undefined }));
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
      setRestoreTargets((current) => ({ ...current, edit: undefined }));
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
    const isEditing = editing === comment.id && contextReady("edit", comment.id);
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
            {restoreTargets.edit === comment.id ? (
              <p role="status" className="form-message">
                Unsaved comment changes restored in this tab.
              </p>
            ) : null}
            {comment.deleted_at ? (
              <p className="form-message--error" role="alert">
                This comment was deleted. Copy your draft or discard it.
              </p>
            ) : comment.body !== originalEditBody ? (
              <p className="form-message" role="status">
                This comment changed while you were editing. Review the latest text before saving:{" "}
                {comment.body}
              </p>
            ) : null}
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
                  setRestoreTargets((current) => ({ ...current, edit: undefined }));
                  restoreActionFocus(comment.id, "edit");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={Boolean(pendingAction) || !editBody.trim() || Boolean(comment.deleted_at)}
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
                setRestoreTargets((current) => ({ ...current, reply: undefined }));
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
                  setRestoreTargets((current) => ({ ...current, edit: undefined }));
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
        {!reply && replyingTo === comment.id && contextReady("reply", comment.id) ? (
          <form
            className="comment-form comment-form--reply"
            onSubmit={(event) => void createReply(event, comment.id)}
          >
            {restoreTargets.reply === comment.id ? (
              <p role="status" className="form-message">
                Unsent reply restored in this tab.
              </p>
            ) : null}
            {comment.deleted_at ? (
              <p className="form-message--error" role="alert">
                This comment was deleted. Copy your reply or discard it.
              </p>
            ) : null}
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
                  setRestoreTargets((current) => ({ ...current, reply: undefined }));
                  restoreActionFocus(comment.id, "reply");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={
                  Boolean(pendingAction) || !replyBody.trim() || Boolean(comment.deleted_at)
                }
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
          {restored && newBody.trim() ? (
            <p className="form-message" role="status">
              Unsent comment restored in this tab.
            </p>
          ) : null}
          <label className="field">
            <span id={`comment-label-${bingoId}`}>Add a comment</span>
            <textarea
              aria-labelledby={`comment-label-${bingoId}`}
              aria-invalid={Boolean(bodyErrors.root)}
              aria-describedby={[
                `comment-hint-${bingoId}`,
                `comment-draft-hint-${bingoId}`,
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
                setRestored(false);
                setBodyErrors((current) => ({ ...current, root: undefined }));
              }}
            />
            <small id={`comment-hint-${bingoId}`}>Required. Up to 2,000 characters.</small>
            <small id={`comment-draft-hint-${bingoId}`}>
              Unsent comments stay in this tab for up to 24 hours. Closing the tab or logging out
              clears them.
            </small>
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
      {!loading && !error && result && displayedComments.length === 0 ? (
        <EmptyState
          title="No comments yet"
          description="Start a useful, respectful conversation about this bingo."
        />
      ) : null}
      {displayedComments.length ? (
        <div className="comment-list">{displayedComments.map((item) => renderComment(item))}</div>
      ) : null}
      {(["reply", "edit"] as const).map((kind) => {
        const targetId = kind === "reply" ? replyingTo : editing;
        const context = contexts[kind];
        if (!targetId || restoreTargets[kind] !== targetId || context?.status === "ready")
          return null;
        return (
          <div key={kind} className="comment-form comment-recovery">
            <p
              id={`${kind}-recovery-message-${bingoId}`}
              role={context?.status === "error" ? "alert" : "status"}
              className="form-message"
            >
              {context?.status === "error"
                ? `${context.message} Your draft is retained. You can copy it, try again, or discard it.`
                : "Restoring the original conversation… Your draft is retained below."}
            </p>
            <label className="field">
              <span id={`${kind}-recovery-label-${bingoId}`}>
                {kind === "reply" ? "Recovered reply" : "Recovered comment changes"}
              </span>
              <textarea
                aria-labelledby={`${kind}-recovery-label-${bingoId}`}
                aria-describedby={`${kind}-recovery-message-${bingoId}`}
                rows={3}
                maxLength={2000}
                readOnly
                value={kind === "reply" ? replyBody : editBody}
              />
            </label>
            <div className="inline-actions">
              {context?.status === "error" ? (
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => {
                    setContexts((current) => ({ ...current, [kind]: { status: "loading" } }));
                    setContextVersion((value) => value + 1);
                  }}
                >
                  Try again
                </button>
              ) : null}
              <button
                type="button"
                className="button button--secondary"
                disabled={Boolean(pendingAction)}
                onClick={() => {
                  if (kind === "reply") {
                    if (!discardReply()) return;
                    setReplyingTo(null);
                    setReplyBody("");
                  } else {
                    if (!discardEdit()) return;
                    setEditing(null);
                    setEditBody("");
                  }
                  setRestoreTargets((current) => ({ ...current, [kind]: undefined }));
                  window.setTimeout(
                    () =>
                      document
                        .querySelector<HTMLTextAreaElement>(".comment-form--root textarea")
                        ?.focus(),
                    0,
                  );
                }}
              >
                Discard draft
              </button>
            </div>
          </div>
        );
      })}
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
              setContexts({});
              setRestoreTargets({ reply: undefined, edit: undefined });
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
              setContexts({});
              setRestoreTargets({ reply: undefined, edit: undefined });
              setResult(null);
              setPage((value) => value + 1);
            }}
          >
            Next
          </button>
        </nav>
      ) : null}
      {reporting && viewer !== "guest" ? (
        <ReportDialog
          key={`${viewer.id}:${reporting.id}`}
          accountId={viewer.id}
          targetType="comment"
          targetId={reporting.id}
          targetLabel="comment"
          onClose={() => setReporting(null)}
        />
      ) : null}
    </section>
  );
}
