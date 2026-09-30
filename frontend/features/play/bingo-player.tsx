"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BingoBoardView,
  revisionCellKey,
  type PlayMarkStyle,
} from "@/components/bingo/bingo-board-view";
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
import {
  clearProgressRecovery,
  readProgressRecovery,
  writeProgressRecovery,
} from "@/lib/progress-recovery";
import type { AuthenticatedUser, BingoDetail, UserProfile } from "@/lib/api/types";

type Viewer = AuthenticatedUser | "guest" | null;

export function BingoPlayer({
  bingoId,
  initialBingo,
  initialViewer,
  initialAuthorProfile,
}: {
  bingoId: string;
  initialBingo?: BingoDetail | null;
  initialViewer?: Viewer;
  initialAuthorProfile?: UserProfile | null;
}) {
  const router = useRouter();
  const [bingo, setBingo] = useState<BingoDetail | null>(initialBingo ?? null);
  const [viewer, setViewer] = useState<Viewer>(initialViewer ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markStyle, setMarkStyle] = useState<PlayMarkStyle>("checkmark");
  const [loading, setLoading] = useState(!initialBingo);
  const [progressReady, setProgressReady] = useState(false);
  const [error, setError] = useState("");
  const [progressError, setProgressError] = useState("");
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [sharing, setSharing] = useState(false);
  const [socialPending, setSocialPending] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null>(
    initialAuthorProfile ?? null,
  );
  const [loadVersion, setLoadVersion] = useState(0);
  const hydrated = useRef(false);
  const requestVersion = useRef(0);
  const progressVersion = useRef(0);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const skipNextSync = useRef(false);
  const resetInFlight = useRef(false);
  const manageInFlight = useRef(false);
  const completedRevision = useRef<string | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const initialBingoConsumed = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const canUseInitial =
        !initialBingoConsumed.current && loadVersion === 0 && initialBingo?.id === bingoId;
      initialBingoConsumed.current = true;
      requestVersion.current += 1;
      progressVersion.current = 0;
      completedRevision.current = null;
      setLoading(!canUseInitial);
      setError("");
      setProgressError("");
      if (!canUseInitial) setBingo(null);
      setViewer(canUseInitial ? (initialViewer ?? null) : null);
      setSelected(new Set());
      setAuthorProfile(canUseInitial ? (initialAuthorProfile ?? null) : null);
      setSaving(false);
      setShareOpen(false);
      setNickname("");
      setSharing(false);
      setSocialPending("");
      setReportOpen(false);
      hydrated.current = false;
      setProgressReady(false);
      skipNextSync.current = false;
      try {
        const detail = canUseInitial && initialBingo ? initialBingo : await api.bingos.get(bingoId);
        if (!active) return;
        setBingo(detail);
        try {
          const savedMark = window.localStorage.getItem(`not-enough-bingo:mark:${bingoId}`);
          setMarkStyle(
            savedMark === "cross" ||
              savedMark === "checkmark" ||
              savedMark === "crossout" ||
              savedMark === "highlight"
              ? savedMark
              : (detail.current_revision?.completion_style ?? "checkmark"),
          );
        } catch {
          setMarkStyle(detail.current_revision?.completion_style ?? "checkmark");
        }
        if (canUseInitial) setLoading(false);
        if (!detail.current_revision) {
          setViewer("guest");
          return;
        }
        trackInteraction("view", {
          bingoId: detail.id,
          revisionId: detail.current_revision.id,
        });
        let user: Viewer = canUseInitial && initialViewer ? initialViewer : "guest";
        if (!canUseInitial || !initialViewer) {
          try {
            user = (await api.auth.session()) ?? "guest";
          } catch (caught) {
            if (!isAuthenticationRequiredError(caught)) {
              setProgressError("Progress sync is unavailable; guest progress will be used.");
            }
          }
        }
        if (!active) return;
        setViewer(user);
        if (
          user !== "guest" &&
          user &&
          user.id !== detail.author.id &&
          (!canUseInitial || !initialAuthorProfile)
        ) {
          try {
            const profile = await api.profiles.get(detail.author.username);
            if (!active) return;
            setAuthorProfile(profile);
          } catch {
            // The board still works when an optional author profile is unavailable.
          }
        }

        if (detail.status !== "published") {
          hydrated.current = true;
          setProgressReady(true);
          return;
        }
        if (user === "guest") {
          const local = readGuestProgress(bingoId, detail.current_revision.id);
          const cellIds = new Set(detail.current_revision.cells.map(revisionCellKey));
          setSelected(
            new Set((local?.selected_cells ?? []).filter((cellId) => cellIds.has(cellId))),
          );
          skipNextSync.current = true;
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
          const recovered = readProgressRecovery(user.id, bingoId, detail.current_revision.id);
          if (recovered) {
            const validIds = new Set(detail.current_revision.cells.map(revisionCellKey));
            setSelected(new Set(recovered.filter((cellId) => validIds.has(cellId))));
            skipNextSync.current = false;
          } else {
            skipNextSync.current = true;
          }
        }
        if (!active) return;
        hydrated.current = true;
        setProgressReady(true);
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
  }, [bingoId, initialBingo, initialViewer, initialAuthorProfile, loadVersion]);

  useEffect(() => {
    const revision = bingo?.current_revision;
    if (!hydrated.current || !revision || !viewer || bingo.status !== "published") {
      return;
    }
    const cells = [...selected];
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    if (viewer === "guest") {
      if (!writeGuestProgress(bingoId, revision.id, cells)) {
        setProgressError(
          "This browser blocked local storage, so guest progress cannot survive a reload.",
        );
      }
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
          clearProgressRecovery(viewer.id, bingoId);
          if (version === requestVersion.current) setProgressError("");
        })
        .catch((caught) => {
          if (version === requestVersion.current) {
            writeProgressRecovery(viewer.id, bingoId, revision.id, cells);
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
    if (!hydrated.current) return;
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
    if (resetInFlight.current || saving || selected.size === 0) return;
    if (!window.confirm("Clear all marks on this bingo? This cannot be undone.")) return;
    resetInFlight.current = true;
    const previousCells = [...selected];
    const resetVersion = ++requestVersion.current;
    if (saving) setSaving(false);
    skipNextSync.current = true;
    setSelected(new Set());
    setProgressError("");
    completedRevision.current = null;
    if (viewer === "guest") {
      if (!clearGuestProgress(bingoId)) {
        setSelected(new Set(previousCells));
        if (
          bingo?.current_revision &&
          previousCells.length === bingo.current_revision.cells.length
        ) {
          completedRevision.current = bingo.current_revision.id;
        }
        setProgressError(
          "This browser blocked local storage, so progress could not be reset. Your selection is still here.",
        );
      } else if (bingo?.current_revision) {
        trackInteraction("reset", {
          bingoId,
          revisionId: bingo.current_revision.id,
        });
      }
      resetInFlight.current = false;
      return;
    }
    setSaving(true);
    saveChain.current = saveChain.current
      .then(async () => {
        await api.progress.reset(bingoId);
        const latest = await api.progress.get(bingoId);
        progressVersion.current = latest.version;
        if (viewer) clearProgressRecovery(viewer.id, bingoId);
        if (bingo?.current_revision) {
          trackInteraction("reset", {
            bingoId,
            revisionId: bingo.current_revision.id,
          });
        }
      })
      .catch((caught) => {
        if (resetVersion !== requestVersion.current) return;
        skipNextSync.current = true;
        setSelected(new Set(previousCells));
        if (viewer && bingo?.current_revision) {
          writeProgressRecovery(viewer.id, bingoId, bingo.current_revision.id, previousCells);
          completedRevision.current =
            previousCells.length === bingo.current_revision.cells.length
              ? bingo.current_revision.id
              : null;
        }
        setProgressError(errorMessage(caught));
      })
      .finally(() => {
        resetInFlight.current = false;
        if (resetVersion === requestVersion.current) setSaving(false);
      });
  }

  async function toggleBingoLike() {
    if (!bingo || !hydrated.current || socialPending) return;
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
    if (!authorProfile || !hydrated.current || socialPending) return;
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
    if (!bingo || !hydrated.current || socialPending || manageInFlight.current) return;
    if (
      action === "delete" &&
      !window.confirm(
        "Delete this bingo? It will disappear from your profile and its link will stop working. Existing shared results keep their revision snapshot. This cannot be undone.",
      )
    ) {
      return;
    }
    manageInFlight.current = true;
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
      manageInFlight.current = false;
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
        <h1 className="sr-only">Opening bingo</h1>
        <LoadingState label="Opening bingo…" />
      </main>
    );
  }
  if (error) {
    return (
      <main id="main-content" className="page-shell">
        <h1 className="sr-only">Bingo unavailable</h1>
        <ErrorState message={error} onRetry={() => setLoadVersion((current) => current + 1)} />
      </main>
    );
  }
  if (!bingo?.current_revision) {
    return (
      <main id="main-content" className="page-shell">
        <EmptyState
          title="This bingo is not published"
          headingLevel={1}
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
          <h1 lang={revision.language || undefined} dir="auto">
            {revision.title}
          </h1>
          {revision.description ? (
            <p lang={revision.language || undefined} dir="auto">
              {revision.description}
            </p>
          ) : null}
        </div>
        <div className="play-actions">
          {viewer && viewer !== "guest" && bingo.permissions.can_like ? (
            <button
              type="button"
              className="button button--secondary"
              aria-pressed={bingo.liked_by_me}
              disabled={!progressReady || Boolean(socialPending)}
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
          ) : viewer === null && playable ? (
            <span className="button button--secondary play-action-placeholder" aria-hidden="true">
              Log in to like
            </span>
          ) : null}
          {viewer && viewer !== "guest" && viewer.id !== bingo.author.id && authorProfile ? (
            <button
              type="button"
              className="button button--secondary"
              aria-pressed={authorProfile.is_following}
              disabled={!progressReady || Boolean(socialPending)}
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
                disabled={!progressReady || Boolean(socialPending)}
                onClick={() =>
                  void manageBingo(bingo.status === "archived" ? "restore" : "archive")
                }
              >
                {bingo.status === "archived" ? "Restore" : "Archive"}
              </button>
              <button
                type="button"
                className="button button--danger"
                disabled={!progressReady || Boolean(socialPending)}
                onClick={() => void manageBingo("delete")}
              >
                Delete
              </button>
            </>
          ) : null}
          {playable && viewer ? (
            <>
              <button
                type="button"
                className="button button--secondary"
                disabled={!progressReady || saving || selected.size === 0}
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
                disabled={!progressReady}
                onClick={() => setShareOpen(true)}
              >
                Share result
              </button>
            </>
          ) : playable ? (
            <>
              <span className="button button--secondary play-action-placeholder" aria-hidden="true">
                Reset
              </span>
              <span className="button button--primary play-action-placeholder" aria-hidden="true">
                Share result
              </span>
            </>
          ) : null}
        </div>
      </header>

      {playable ? (
        <fieldset className="play-mark-menu" disabled={!progressReady}>
          <legend>Mark cells with</legend>
          {(
            [
              ["cross", "×", "Cross"],
              ["checkmark", "✓", "Checkmark"],
              ["crossout", "╱", "Diagonal line"],
              ["highlight", "▧", "Highlight"],
            ] as const
          ).map(([value, symbol, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="play-mark-style"
                value={value}
                checked={markStyle === value}
                onChange={() => {
                  setMarkStyle(value);
                  try {
                    window.localStorage.setItem(`not-enough-bingo:mark:${bingoId}`, value);
                  } catch {
                    /* Private browsing may block storage. */
                  }
                }}
              />
              <span aria-hidden="true">{symbol}</span> {label}
            </label>
          ))}
        </fieldset>
      ) : null}

      <BingoBoardView
        revision={revision}
        selected={selected}
        completionStyle={markStyle}
        readOnly={!playable}
        disabled={playable && !progressReady}
        onToggle={toggleCell}
      />

      <p className="progress-status" aria-live="polite">
        {playable
          ? !progressReady
            ? "Loading your progress…"
            : saving
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
