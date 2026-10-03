"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BingoCardPreview } from "@/components/bingo/bingo-card-preview";
import { CommentIcon, HeartIcon } from "@/components/ui/icons";
import { trackInteraction } from "@/lib/analytics";
import { api, errorMessage, isAuthenticationRequiredError } from "@/lib/api/client";
import {
  AUTH_SIGNED_IN_EVENT,
  AUTH_SESSION_ENDED_EVENT,
  AUTH_SIGNED_OUT_EVENT,
} from "@/lib/auth-events";
import type { BingoSummary } from "@/lib/api/types";
import { formatCount } from "@/lib/format-count";
import { languageLabel } from "@/lib/languages";

export function BingoCard({ bingo }: { bingo: BingoSummary }) {
  const router = useRouter();
  const articleRef = useRef<HTMLElement>(null);
  const [liked, setLiked] = useState(bingo.liked_by_me);
  const [likeCount, setLikeCount] = useState(bingo.stats.likes);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const actionInFlight = useRef(false);
  const actionLifetime = useRef(0);
  const title = bingo.title.trim() || "Untitled bingo";
  const cardHref = bingo.status === "draft" ? `/create?bingo=${bingo.id}` : `/bingo/${bingo.id}`;

  useEffect(() => {
    const element = articleRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      trackInteraction("impression", { bingoId: bingo.id });
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        trackInteraction("impression", { bingoId: bingo.id });
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [bingo.id]);

  useEffect(() => {
    setLiked(bingo.liked_by_me);
    setLikeCount(bingo.stats.likes);
  }, [bingo.id, bingo.liked_by_me, bingo.stats.likes]);

  useEffect(() => {
    const invalidate = () => {
      actionLifetime.current += 1;
      actionInFlight.current = false;
    };
    const refresh = () => {
      invalidate();
      setPending(false);
      setActionError("");
    };
    refresh();
    window.addEventListener(AUTH_SIGNED_IN_EVENT, refresh);
    window.addEventListener(AUTH_SESSION_ENDED_EVENT, refresh);
    window.addEventListener(AUTH_SIGNED_OUT_EVENT, refresh);
    return () => {
      invalidate();
      window.removeEventListener(AUTH_SIGNED_IN_EVENT, refresh);
      window.removeEventListener(AUTH_SESSION_ENDED_EVENT, refresh);
      window.removeEventListener(AUTH_SIGNED_OUT_EVENT, refresh);
    };
  }, [bingo.id]);

  async function toggleLike() {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    const lifetime = actionLifetime.current;
    setPending(true);
    setActionError("");
    try {
      if (liked) {
        await api.bingos.unlike(bingo.id);
        if (lifetime !== actionLifetime.current) return;
        setLiked(false);
        setLikeCount((current) => Math.max(0, current - 1));
      } else {
        const updated = await api.bingos.like(bingo.id);
        if (lifetime !== actionLifetime.current) return;
        setLiked(updated.liked_by_me);
        setLikeCount(updated.stats.likes);
      }
    } catch (error) {
      if (lifetime !== actionLifetime.current) return;
      if (isAuthenticationRequiredError(error)) {
        router.push(`/login?next=${encodeURIComponent(`/bingo/${bingo.id}`)}`);
        return;
      }
      setActionError(errorMessage(error));
    } finally {
      if (lifetime === actionLifetime.current) {
        actionInFlight.current = false;
        setPending(false);
      }
    }
  }

  return (
    <article ref={articleRef} className="bingo-card hover-lift">
      <Link
        className="bingo-card__main"
        href={cardHref}
        onClick={() => {
          if (bingo.status === "published") trackInteraction("open", { bingoId: bingo.id });
        }}
      >
        <div className="bingo-card__heading">
          <h2 lang={bingo.language || undefined} dir="auto">
            {title}
          </h2>
          <span>
            by {bingo.author.display_name || `@${bingo.author.username}`} ·{" "}
            {languageLabel(bingo.language)}
          </span>
        </div>
        <BingoCardPreview preview={bingo.preview} fallbackSize={bingo.size} title={title} />
      </Link>
      {actionError ? (
        <p className="card-action-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {bingo.tags.length ? (
        <nav className="bingo-card__tags" aria-label={`Tags for ${title}`}>
          {bingo.tags.slice(0, 3).map((tag) => (
            <Link
              key={tag.id}
              href={`/explore?tags=${encodeURIComponent(tag.slug)}`}
              onClick={() =>
                trackInteraction("tag_interaction", {
                  bingoId: bingo.id,
                  tag: tag.slug,
                })
              }
            >
              #{tag.name}
            </Link>
          ))}
        </nav>
      ) : (
        <div className="bingo-card__tags" aria-hidden="true" />
      )}
      <div className="bingo-card__actions">
        {bingo.status === "published" ? (
          <>
            <button
              type="button"
              className="card-action"
              aria-label={liked ? `Unlike ${title}` : `Like ${title}`}
              aria-pressed={liked}
              disabled={pending}
              onClick={toggleLike}
            >
              <HeartIcon filled={liked} />
              <span>{formatCount(likeCount)}</span>
            </button>
            <Link
              className="card-action"
              href={`/bingo/${bingo.id}#comments`}
              aria-label={`View comments for ${title}`}
            >
              <CommentIcon />
              <span>{formatCount(bingo.stats.comments)}</span>
            </Link>
          </>
        ) : (
          <span className="card-status">{bingo.status}</span>
        )}
      </div>
    </article>
  );
}
