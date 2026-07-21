"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BingoCardPreview } from "@/components/bingo/bingo-card-preview";
import { CommentIcon, HeartIcon } from "@/components/ui/icons";
import { trackInteraction } from "@/lib/analytics";
import { api, ApiClientError, errorMessage } from "@/lib/api/client";
import type { BingoSummary } from "@/lib/api/types";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

export function BingoCard({ bingo }: { bingo: BingoSummary }) {
  const router = useRouter();
  const articleRef = useRef<HTMLElement>(null);
  const [liked, setLiked] = useState(bingo.liked_by_me);
  const [likeCount, setLikeCount] = useState(bingo.stats.likes);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");

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
  }, [bingo.liked_by_me, bingo.stats.likes]);

  async function toggleLike() {
    if (pending) return;
    setPending(true);
    setActionError("");
    try {
      if (liked) {
        await api.bingos.unlike(bingo.id);
        setLiked(false);
        setLikeCount((current) => Math.max(0, current - 1));
      } else {
        const updated = await api.bingos.like(bingo.id);
        setLiked(updated.liked_by_me);
        setLikeCount(updated.stats.likes);
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        router.push(`/login?next=${encodeURIComponent(`/bingo/${bingo.id}`)}`);
        return;
      }
      setActionError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <article ref={articleRef} className="bingo-card">
      <Link
        className="bingo-card__main"
        href={`/bingo/${bingo.id}`}
        onClick={() => trackInteraction("open", { bingoId: bingo.id })}
      >
        <div className="bingo-card__heading">
          <h2>{bingo.title}</h2>
          <span>by {bingo.author.display_name || `@${bingo.author.username}`}</span>
        </div>
        <BingoCardPreview preview={bingo.preview} fallbackSize={bingo.size} title={bingo.title} />
      </Link>
      {bingo.tags.length ? (
        <nav className="bingo-card__tags" aria-label={`Tags for ${bingo.title}`}>
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
      {actionError ? (
        <p className="card-action-error" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="bingo-card__actions">
        {bingo.status === "published" ? (
          <>
            <button
              type="button"
              className="card-action"
              aria-label={liked ? `Unlike ${bingo.title}` : `Like ${bingo.title}`}
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
              aria-label={`View comments for ${bingo.title}`}
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
