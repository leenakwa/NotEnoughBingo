"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { BingoBoardView, revisionCellKey } from "@/components/bingo/bingo-board-view";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { CommentsPanel } from "@/features/social/comments-panel";
import { ReportDialog } from "@/features/social/report-dialog";
import { trackInteraction } from "@/lib/analytics";
import { api, ApiClientError, errorMessage, isAuthenticationRequiredError } from "@/lib/api/client";
import {
  clearGuestProgress,
  makeIdempotencyKey,
  readGuestProgress,
  writeGuestProgress,
} from "@/lib/guest-progress";
import type { AuthenticatedUser, BingoDetail, UserProfile } from "@/lib/api/types";

type Viewer = AuthenticatedUser | "guest" | null;

export function BingoPlayer({ bingoId }: { bingoId: string }) {
  const router = useRouter();
  const [bingo, setBingo] = useState<BingoDetail | null>(null);
  const [viewer, setViewer] = useState<Viewer>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progressError, setProgressError] = useState("");
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [sharing, setSharing] = useState(false);
  const [socialPending, setSocialPending] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(null);
  const [loadVersion, setLoadVersion] = useState(0);
  const hydrated = useRef(false);
  const requestVersion = useRef(0);
  const progressVersion = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const skipNextSync = useRef(false);
  const completedRevision = useRef<string | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      requestVersion.current += 1;
      progressVersion.current = 0;
      completedRevision.current = null;
      setLoading(true);
      setError("");
      setProgressError("");
      setBingo(null);
      setViewer(null);
      setSelected(new Set());
      setAuthorProfile(null);
      setSaving(false);
      setShareOpen(false);
      setNickname("");
      setSharing(false);
      setSocialPending("");
      setReportOpen(false);
      hydrated.current = false;
      skipNextSync.current = false;
      try {
        const detail = await api.bingos.get(bingoId);
        if (!active) return;
        setBingo(detail);
        if (!detail.current_revision) {
          setViewer("guest");
          return;
        }
        trackInteraction("view", {
          bingoId: detail.id,
          revisionId: detail.current_revision.id,
        });
        void api.profiles
          .get(detail.author.username)
          .then((profile) => {
            if (active) setAuthorProfile(profile);
          })
          .catch(() => undefined);

        let user: Viewer = "guest";
        try {
          user = await api.auth.me();
        } catch (caught) {
          if (!isAuthenticationRequiredError(caught)) {
            setProgressError("Progress sync is unavailable; guest progress will be used.");
          }
        }
        if (!active) return;
        setViewer(user);

        if (detail.status !== "published") {
          hydrated.current = true;
          return;
        }
        if (user === "guest") {
          const local = readGuestProgress(bingoId, detail.current_revision.id);
          const cellIds = new Set(detail.current_revision.cells.map(revisionCellKey));
          setSelected(
            new Set((local?.selected_cells ?? []).filter((cellId) => cellIds.has(cellId))),
          );
        } else {
          try {
            const progress = await api.progress.get(bingoId);
            progressVersion.current = progress.version;
            if (active && progress.revision_id === detail.current_revision.id) {
              setSelected(new Set(progress.selected_cells));
              if (progress.selected_cells.length === detail.current_revision.cells.length) {
                completedRevision.current = detail.current_revision.id;
              }
            }
          } catch (caught) {
            if (!(caught instanceof ApiClientError) || caught.status !== 404) {
              if (active) setProgressError(errorMessage(caught));
            }
          }
          if (!active) return;
          skipNextSync.current = true;
        }
        if (!active) return;
        hydrated.current = true;
      } catch (caught) {
        if (active) setError(errorMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [bingoId, loadVersion]);

  useEffect(() => {
    const revision = bingo?.current_revision;
    if (!hydrated.current || !revision || !viewer || bingo.status !== "published") {
      return;
    }
    const cells = [...selected];
    if (viewer === "guest") {
      if (!writeGuestProgress(bingoId, revision.id, cells)) {
        setProgressError(
          "This browser blocked local storage, so guest progress cannot survive a reload.",
        );
      }
      return;
    }
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }

    const version = ++requestVersion.current;
    const timeout = window.setTimeout(() => {
      setSaving(true);
      saveChain.current = saveChain.current
        .then(async () => {
          let saved;
          try {
            saved = await api.progress.save(bingoId, revision.id, cells, progressVersion.current);
          } catch (caught) {
            if (!(caught instanceof ApiClientError) || caught.status !== 409) {
              throw caught;
            }
            const latest = await api.progress.get(bingoId);
            progressVersion.current = latest.version;
            saved = await api.progress.save(bingoId, revision.id, cells, latest.version);
          }
          progressVersion.current = saved.version;
          if (version === requestVersion.current) setProgressError("");
        })
        .catch((caught) => {
          if (version === requestVersion.current) {
            setProgressError(errorMessage(caught));
          }
        })
        .finally(() => {
          if (version === requestVersion.current) setSaving(false);
        });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [bingo, bingoId, selected, viewer]);

  function toggleCell(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else {
        next.add(key);
        if (current.size === 0 && bingo?.current_revision) {
          trackInteraction("start", {
            bingoId,
            revisionId: bingo.current_revision.id,
          });
        }
      }
      if (
        bingo?.current_revision &&
        next.size === bingo.current_revision.cells.length &&
        completedRevision.current !== bingo.current_revision.id
      ) {
        completedRevision.current = bingo.current_revision.id;
        trackInteraction("complete", {
          bingoId,
          revisionId: bingo.current_revision.id,
        });
      } else if (bingo?.current_revision && next.size < bingo.current_revision.cells.length) {
        completedRevision.current = null;
      }
      return next;
    });
  }

  async function reset() {
    if (saving) setSaving(false);
    requestVersion.current += 1;
    skipNextSync.current = true;
    setSelected(new Set());
    setProgressError("");
    completedRevision.current = null;
    if (bingo?.current_revision) {
      trackInteraction("reset", {
        bingoId,
        revisionId: bingo.current_revision.id,
      });
    }
    if (viewer === "guest") {
      if (!clearGuestProgress(bingoId)) {
        setProgressError(
          "This browser blocked local storage. Your selection is clear now but may return after a reload.",
        );
      }
      return;
    }
    setSaving(true);
    saveChain.current = saveChain.current
      .then(async () => {
        await api.progress.reset(bingoId);
        const latest = await api.progress.get(bingoId);
        progressVersion.current = latest.version;
      })
      .catch((caught) => setProgressError(errorMessage(caught)))
      .finally(() => setSaving(false));
  }

  async function toggleBingoLike() {
    if (!bingo || socialPending) return;
    setSocialPending("like");
    setProgressError("");
    try {
      if (bingo.liked_by_me) {
        await api.bingos.unlike(bingo.id);
        setBingo((current) =>
          current
            ? {
                ...current,
                liked_by_me: false,
                stats: {
                  ...current.stats,
                  likes: Math.max(0, current.stats.likes - 1),
                },
              }
            : current,
        );
      } else {
        const updated = await api.bingos.like(bingo.id);
        setBingo((current) =>
          current
            ? {
                ...current,
                liked_by_me: updated.liked_by_me,
                stats: updated.stats,
              }
            : current,
        );
      }
    } catch (caught) {
      setProgressError(errorMessage(caught));
    } finally {
      setSocialPending("");
    }
  }

  async function toggleFollow() {
    if (!authorProfile || socialPending) return;
    setSocialPending("follow");
    setProgressError("");
    try {
      if (authorProfile.is_following) {
        await api.follows.unfollow(authorProfile.id);
      } else {
        await api.follows.follow(authorProfile.id);
      }
      setAuthorProfile({
        ...authorProfile,
        is_following: !authorProfile.is_following,
        follower_count: Math.max(
          0,
          authorProfile.follower_count + (authorProfile.is_following ? -1 : 1),
        ),
      });
    } catch (caught) {
      setProgressError(errorMessage(caught));
    } finally {
      setSocialPending("");
    }
  }

  async function manageBingo(action: "archive" | "restore" | "delete") {
    if (!bingo || socialPending) return;
    if (
      action === "delete" &&
      !window.confirm(
        "Delete this bingo? Existing immutable shared results keep their revision snapshot.",
      )
    ) {
      return;
    }
    setSocialPending(action);
    setProgressError("");
    try {
      if (action === "delete") {
        await api.bingos.remove(bingo.id);
        router.replace("/profile");
        return;
      }
      const updated =
        action === "archive"
          ? await api.bingos.archive(bingo.id)
          : await api.bingos.restore(bingo.id);
      setBingo(updated);
    } catch (caught) {
      setProgressError(errorMessage(caught));
    } finally {
      setSocialPending("");
    }
  }

  async function share() {
    const revision = bingo?.current_revision;
    if (!revision || sharing) return;
    if (viewer === "guest" && !nickname.trim()) {
      setProgressError("Enter a nickname to create a guest share link.");
      return;
    }
    setSharing(true);
    setProgressError("");
    try {
      const result = await api.shares.create(
        bingoId,
        {
          revision_id: revision.id,
          selected_cells: [...selected],
          ...(viewer === "guest" ? { display_name: nickname.trim() } : {}),
        },
        makeIdempotencyKey(),
      );
      router.push(`/share/${bingoId}/${result.id}`);
    } catch (caught) {
      setProgressError(errorMessage(caught));
      setSharing(false);
    }
  }

  function closeSharePanel() {
    setShareOpen(false);
    window.setTimeout(() => shareButtonRef.current?.focus(), 0);
  }

  if (loading) {
    return (
      <main id="main-content" className="page-shell">
        <LoadingState label="Opening bingo…" />
      </main>
    );
  }
  if (error) {
    return (
      <main id="main-content" className="page-shell">
        <ErrorState message={error} onRetry={() => setLoadVersion((current) => current + 1)} />
      </main>
    );
  }
  if (!bingo?.current_revision) {
    return (
      <main id="main-content" className="page-shell">
        <EmptyState
          title="This bingo is not published"
          description="Only its author can continue editing the current draft."
          action={
            bingo?.permissions.can_edit
              ? { href: `/create?bingo=${bingo.id}`, label: "Open editor" }
              : undefined
          }
        />
      </main>
    );
  }

  const revision = bingo.current_revision;
  const playable = bingo.status === "published";
  return (
    <main id="main-content" className="play-shell">
      <header className="bingo-heading">
        <div>
          <p className="eyebrow">
            by <Link href={`/profile/${bingo.author.username}`}>@{bingo.author.username}</Link>
          </p>
          <h1>{revision.title}</h1>
          {revision.description ? <p>{revision.description}</p> : null}
        </div>
        <div className="play-actions">
          {viewer && viewer !== "guest" && bingo.permissions.can_like ? (
            <button
              type="button"
              className="button button--secondary"
              aria-pressed={bingo.liked_by_me}
              disabled={Boolean(socialPending)}
              onClick={() => void toggleBingoLike()}
            >
              {bingo.liked_by_me ? "Liked" : "Like"} · {bingo.stats.likes}
            </button>
          ) : viewer === "guest" ? (
            <Link
              className="button button--secondary"
              href={`/login?next=${encodeURIComponent(`/bingo/${bingoId}`)}`}
            >
              Log in to like
            </Link>
          ) : null}
          {viewer && viewer !== "guest" && viewer.id !== bingo.author.id && authorProfile ? (
            <button
              type="button"
              className="button button--secondary"
              aria-pressed={authorProfile.is_following}
              disabled={Boolean(socialPending)}
              onClick={() => void toggleFollow()}
            >
              {authorProfile.is_following ? "Following" : "Follow author"}
            </button>
          ) : null}
          {viewer && viewer !== "guest" && bingo.permissions.can_report ? (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => setReportOpen(true)}
            >
              Report
            </button>
          ) : null}
          {bingo.permissions.can_edit ? (
            <>
              <Link className="button button--secondary" href={`/create?bingo=${bingo.id}`}>
                Edit
              </Link>
              <button
                type="button"
                className="button button--secondary"
                disabled={Boolean(socialPending)}
                onClick={() =>
                  void manageBingo(bingo.status === "archived" ? "restore" : "archive")
                }
              >
                {bingo.status === "archived" ? "Restore" : "Archive"}
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={Boolean(socialPending)}
                onClick={() => void manageBingo("delete")}
              >
                Delete
              </button>
            </>
          ) : null}
          {playable ? (
            <>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void reset()}
              >
                Reset
              </button>
              <button
                ref={shareButtonRef}
                type="button"
                className="button button--primary"
                aria-expanded={shareOpen}
                aria-controls="share-result-panel"
                onClick={() => setShareOpen(true)}
              >
                Share result
              </button>
            </>
          ) : null}
        </div>
      </header>

      <BingoBoardView
        revision={revision}
        selected={selected}
        completionStyle={revision.completion_style}
        readOnly={!playable}
        onToggle={toggleCell}
      />

      <p className="progress-status" aria-live="polite">
        {playable
          ? saving
            ? "Saving progress…"
            : `${selected.size} of ${revision.cells.length} selected`
          : "This bingo is archived and shown read-only to its author."}
      </p>
      {progressError ? (
        <p className="form-message form-message--error" role="alert">
          {progressError}
        </p>
      ) : null}

      {playable && shareOpen ? (
        <section id="share-result-panel" className="share-panel" aria-labelledby="share-title">
          <div>
            <h2 id="share-title">Share this result</h2>
            <p>A permanent read-only snapshot will use this published revision.</p>
          </div>
          {viewer === "guest" ? (
            <label className="field">
              <span>Your nickname</span>
              <input
                value={nickname}
                maxLength={50}
                autoComplete="nickname"
                autoFocus
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
          ) : null}
          <div className="inline-actions">
            <button type="button" className="button button--secondary" onClick={closeSharePanel}>
              Cancel
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={sharing}
              onClick={() => void share()}
            >
              {sharing ? "Creating link…" : "Create share link"}
            </button>
          </div>
        </section>
      ) : null}

      {playable && viewer ? <CommentsPanel bingoId={bingo.id} viewer={viewer} /> : null}
      {reportOpen ? (
        <ReportDialog
          targetType="bingo"
          targetId={bingo.id}
          targetLabel="bingo"
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </main>
  );
}
