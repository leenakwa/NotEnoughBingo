"use client";

import Link from "next/link";
import { AuthLink } from "@/components/auth/auth-link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  AUTH_SIGNED_IN_EVENT,
  AUTH_SESSION_ENDED_EVENT,
  AUTH_SIGNED_OUT_EVENT,
} from "@/lib/auth-events";
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
  const [progressLoadFailed, setProgressLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState("");
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
  const socialActionInFlight = useRef(false);
  const shareInFlight = useRef(false);
  const completedRevision = useRef<string | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const initialBingoConsumed = useRef(false);
  const guestSelectionToSync = useRef<string[] | null>(null);
  const mutationLifetime = useRef(0);
  const invalidateMutations = useCallback(() => {
    mutationLifetime.current += 1;
    requestVersion.current += 1;
    hydrated.current = false;
    saveChain.current = Promise.resolve();
    resetInFlight.current = false;
    socialActionInFlight.current = false;
    shareInFlight.current = false;
  }, []);

  useEffect(() => {
    const refresh = () => {
      invalidateMutations();
      setProgressReady(false);
      if (viewer === "guest" && selected.size > 0) guestSelectionToSync.current = [...selected];
      setLoadVersion((version) => version + 1);
    };
    window.addEventListener(AUTH_SIGNED_IN_EVENT, refresh);
    const sessionEnded = () => {
      invalidateMutations();
      setProgressReady(false);
      guestSelectionToSync.current = null;
      setSelected(new Set());
      setLoadVersion((version) => version + 1);
    };
    window.addEventListener(AUTH_SESSION_ENDED_EVENT, sessionEnded);
    window.addEventListener(AUTH_SIGNED_OUT_EVENT, sessionEnded);
    return () => {
      window.removeEventListener(AUTH_SIGNED_IN_EVENT, refresh);
      window.removeEventListener(AUTH_SESSION_ENDED_EVENT, sessionEnded);
      window.removeEventListener(AUTH_SIGNED_OUT_EVENT, sessionEnded);
    };
  }, [viewer, selected, invalidateMutations]);

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
      setProgressLoadFailed(false);
      if (!canUseInitial) setBingo(null);
      setViewer(canUseInitial ? (initialViewer ?? null) : null);
      setSelected(new Set());
      setAuthorProfile(canUseInitial ? (initialAuthorProfile ?? null) : null);
      setSaving(false);
      setShareOpen(false);
      setNickname("");
      setNicknameError("");
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
            if (active && !isAuthenticationRequiredError(caught)) {
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
          void api.profiles
            .get(detail.author.username)
            .then((profile) => {
              if (active) setAuthorProfile(profile);
            })
            .catch(() => {
              // Optional follow details cannot delay loading the player's marks.
            });
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
            if (!active) return;
            progressVersion.current = progress.version;
            if (active && progress.revision_id === detail.current_revision.id) {
              setSelected(new Set(progress.selected_cells));
              if (progress.selected_cells.length === detail.current_revision.cells.length) {
                completedRevision.current = detail.current_revision.id;
              }
            }
          } catch (caught) {
            if (!(caught instanceof ApiClientError) || caught.status !== 404) {
              if (active) {
                setProgressError(errorMessage(caught));
                setProgressLoadFailed(true);
              }
              return;
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
          if (guestSelectionToSync.current) {
            const validIds = new Set(detail.current_revision.cells.map(revisionCellKey));
            const guestCells = guestSelectionToSync.current.filter((id) => validIds.has(id));
            setSelected((current) => new Set([...current, ...guestCells]));
            guestSelectionToSync.current = null;
            skipNextSync.current = false;
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
      invalidateMutations();
    };
  }, [
    bingoId,
    initialBingo,
    initialViewer,
    initialAuthorProfile,
    loadVersion,
    invalidateMutations,
  ]);

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
    const lifetime = mutationLifetime.current;
    const isCurrent = () => lifetime === mutationLifetime.current;
    const timeout = window.setTimeout(() => {
      setSaving(true);
      saveChain.current = saveChain.current
        .then(async () => {
          if (!isCurrent()) return;
          let saved;
          try {
            saved = await api.progress.save(bingoId, revision.id, cells, progressVersion.current);
          } catch (caught) {
            if (!isCurrent()) return;
            if (!(caught instanceof ApiClientError) || caught.status !== 409) {
              throw caught;
            }
            const latest = await api.progress.get(bingoId);
            if (!isCurrent()) return;
            progressVersion.current = latest.version;
            saved = await api.progress.save(bingoId, revision.id, cells, latest.version);
          }
          if (!isCurrent()) return;
          progressVersion.current = saved.version;
          clearProgressRecovery(viewer.id, bingoId);
          if (version === requestVersion.current) setProgressError("");
        })
        .catch((caught) => {
          if (isCurrent() && version === requestVersion.current) {
            writeProgressRecovery(viewer.id, bingoId, revision.id, cells);
            setProgressError(errorMessage(caught));
          }
        })
        .finally(() => {
          if (isCurrent() && version === requestVersion.current) setSaving(false);
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
    const lifetime = mutationLifetime.current;
    const isCurrent = () => lifetime === mutationLifetime.current;
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
        if (!isCurrent()) return;
        await api.progress.reset(bingoId);
        if (!isCurrent()) return;
        const latest = await api.progress.get(bingoId);
        if (!isCurrent()) return;
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
        if (!isCurrent() || resetVersion !== requestVersion.current) return;
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
        if (!isCurrent()) return;
        resetInFlight.current = false;
        if (resetVersion === requestVersion.current) setSaving(false);
      });
  }

  async function toggleBingoLike() {
    if (!bingo || !hydrated.current || socialPending || socialActionInFlight.current) return;
    socialActionInFlight.current = true;
    setSocialPending("like");
    const lifetime = mutationLifetime.current;
    setProgressError("");
    try {
      if (bingo.liked_by_me) {
        await api.bingos.unlike(bingo.id);
        if (lifetime !== mutationLifetime.current) return;
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
        if (lifetime !== mutationLifetime.current) return;
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
      if (lifetime !== mutationLifetime.current) return;
      setProgressError(errorMessage(caught));
    } finally {
      if (lifetime === mutationLifetime.current) {
        socialActionInFlight.current = false;
        setSocialPending("");
      }
    }
  }

  async function toggleFollow() {
    if (!authorProfile || !hydrated.current || socialPending || socialActionInFlight.current)
      return;
    socialActionInFlight.current = true;
    setSocialPending("follow");
    const lifetime = mutationLifetime.current;
    setProgressError("");
    try {
      if (authorProfile.is_following) {
        await api.follows.unfollow(authorProfile.id);
      } else {
        await api.follows.follow(authorProfile.id);
      }
      if (lifetime !== mutationLifetime.current) return;
      setAuthorProfile({
        ...authorProfile,
        is_following: !authorProfile.is_following,
        follower_count: Math.max(
          0,
          authorProfile.follower_count + (authorProfile.is_following ? -1 : 1),
        ),
      });
    } catch (caught) {
      if (lifetime !== mutationLifetime.current) return;
      setProgressError(errorMessage(caught));
    } finally {
      if (lifetime === mutationLifetime.current) {
        socialActionInFlight.current = false;
        setSocialPending("");
      }
    }
  }

  async function manageBingo(action: "archive" | "restore" | "delete") {
    if (!bingo || !hydrated.current || socialPending || socialActionInFlight.current) return;
    if (
      action === "delete" &&
      !window.confirm(
        "Delete this bingo? It will disappear from your profile and its link will stop working. Existing shared results keep their revision snapshot. This cannot be undone.",
      )
    ) {
      return;
    }
    socialActionInFlight.current = true;
    const lifetime = mutationLifetime.current;
    setSocialPending(action);
    setProgressError("");
    try {
      if (action === "delete") {
        await api.bingos.remove(bingo.id);
        if (lifetime !== mutationLifetime.current) return;
        router.replace("/profile");
        return;
      }
      const updated =
        action === "archive"
          ? await api.bingos.archive(bingo.id)
          : await api.bingos.restore(bingo.id);
      if (lifetime !== mutationLifetime.current) return;
      setBingo(updated);
    } catch (caught) {
      if (lifetime !== mutationLifetime.current) return;
      setProgressError(errorMessage(caught));
    } finally {
      if (lifetime === mutationLifetime.current) {
        socialActionInFlight.current = false;
        setSocialPending("");
      }
    }
  }

  async function share(form: HTMLFormElement) {
    const revision = bingo?.current_revision;
    if (!revision || !hydrated.current || sharing || shareInFlight.current) return;
    const submittedNickname =
      viewer === "guest" ? String(new FormData(form).get("nickname") ?? "") : "";
    if (viewer === "guest") setNickname(submittedNickname);
    if (viewer === "guest" && !submittedNickname.trim()) {
      setNicknameError("Enter a nickname to create a guest share link.");
      nicknameRef.current?.focus();
      return;
    }
    shareInFlight.current = true;
    setSharing(true);
    const lifetime = mutationLifetime.current;
    setProgressError("");
    setNicknameError("");
    try {
      const result = await api.shares.create(
        bingoId,
        {
          revision_id: revision.id,
          selected_cells: [...selected],
          ...(viewer === "guest" ? { display_name: submittedNickname.trim() } : {}),
        },
        makeIdempotencyKey(),
      );
      if (lifetime !== mutationLifetime.current) return;
      router.push(`/share/${bingoId}/${result.id}`);
    } catch (caught) {
      if (lifetime !== mutationLifetime.current) return;
      shareInFlight.current = false;
      setProgressError(errorMessage(caught));
      setSharing(false);
    }
  }

  function closeSharePanel() {
    if (shareInFlight.current) return;
    setShareOpen(false);
    setNicknameError("");
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
            <AuthLink
              className="button button--secondary"
              href={`/login?next=${encodeURIComponent(`/bingo/${bingoId}`)}`}
            >
              Log in to like
            </AuthLink>
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
          ? progressLoadFailed
            ? "Saved progress is unavailable."
            : !progressReady
              ? "Loading your progress…"
              : saving
                ? "Saving progress…"
                : `${selected.size} of ${revision.cells.length} selected`
          : "This bingo is archived and shown read-only to its author."}
      </p>
      {progressLoadFailed ? (
        <div className="form-message form-message--error" role="alert">
          <p>Your saved progress could not be loaded. Your existing marks have not been changed.</p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setLoadVersion((version) => version + 1)}
          >
            Retry loading progress
          </button>
        </div>
      ) : progressError ? (
        <p className="form-message form-message--error" role="alert">
          {progressError}
        </p>
      ) : null}

      {playable && shareOpen ? (
        <form
          id="share-result-panel"
          className="share-panel"
          aria-labelledby="share-title"
          onSubmit={(event) => {
            event.preventDefault();
            void share(event.currentTarget);
          }}
        >
          <div>
            <h2 id="share-title">Share this result</h2>
            <p>A permanent read-only snapshot will use this published revision.</p>
          </div>
          {viewer === "guest" ? (
            <label className="field">
              <span id="share-nickname-label">Your nickname</span>
              <input
                ref={nicknameRef}
                name="nickname"
                value={nickname}
                required
                maxLength={50}
                autoComplete="nickname"
                autoFocus
                disabled={sharing}
                aria-labelledby="share-nickname-label"
                aria-invalid={Boolean(nicknameError)}
                aria-describedby={
                  nicknameError ? "share-nickname-hint share-nickname-error" : "share-nickname-hint"
                }
                onInvalid={(event) => {
                  setNicknameError("Enter a nickname to create a guest share link.");
                  event.currentTarget.focus();
                }}
                onChange={(event) => {
                  setNickname(event.target.value);
                  setNicknameError("");
                }}
              />
              <small id="share-nickname-hint">Required. Up to 50 characters.</small>
              {nicknameError ? (
                <small id="share-nickname-error" className="form-message--error" role="alert">
                  {nicknameError}
                </small>
              ) : null}
            </label>
          ) : null}
          <div className="inline-actions">
            <button
              type="button"
              className="button button--secondary"
              disabled={sharing}
              onClick={closeSharePanel}
            >
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={sharing}>
              {sharing ? "Creating link…" : "Create share link"}
            </button>
          </div>
        </form>
      ) : null}

      {playable && viewer ? <CommentsPanel bingoId={bingo.id} viewer={viewer} /> : null}
      {reportOpen && viewer && viewer !== "guest" ? (
        <ReportDialog
          key={`${viewer.id}:${bingo.id}`}
          accountId={viewer.id}
          targetType="bingo"
          targetId={bingo.id}
          targetLabel="bingo"
          onClose={() => setReportOpen(false)}
        />
      ) : null}
    </main>
  );
}
