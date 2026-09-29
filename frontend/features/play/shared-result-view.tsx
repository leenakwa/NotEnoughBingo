"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BingoBoardView } from "@/components/bingo/bingo-board-view";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import type { SharedResult } from "@/lib/api/types";

export function SharedResultView({
  bingoId,
  shareId,
  initialResult,
}: {
  bingoId: string;
  shareId: string;
  initialResult?: SharedResult | null;
}) {
  const [result, setResult] = useState<SharedResult | null>(initialResult ?? null);
  const [error, setError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);
  const [shareStatus, setShareStatus] = useState("");
  const initialResultConsumed = useRef(false);

  useEffect(() => {
    if (!initialResultConsumed.current && loadVersion === 0 && initialResult) {
      initialResultConsumed.current = true;
      return;
    }
    initialResultConsumed.current = true;
    const controller = new AbortController();
    setError("");
    api.shares
      .get(bingoId, shareId, controller.signal)
      .then(setResult)
      .catch((caught) => {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      });
    return () => controller.abort();
  }, [bingoId, initialResult, loadVersion, shareId]);

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareStatus("Link copied.");
    } catch {
      setShareStatus("Copy failed. Select the address from your browser to share it.");
    }
  }

  async function shareResult(): Promise<void> {
    if (!result) return;
    if (!navigator.share) {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: `${result.owner_display_name}'s result — ${result.revision.title}`,
        text: `${result.selected_cells.length} of ${result.revision.cells.length} selected`,
        url: window.location.href,
      });
      setShareStatus("Shared.");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setShareStatus("Sharing was unavailable. You can copy the link instead.");
    }
  }

  if (error) {
    return (
      <main id="main-content" className="page-shell">
        <ErrorState message={error} onRetry={() => setLoadVersion((current) => current + 1)} />
      </main>
    );
  }
  if (!result) {
    return (
      <main id="main-content" className="page-shell">
        <LoadingState label="Opening shared result…" />
      </main>
    );
  }

  return (
    <main id="main-content" className="play-shell">
      <header className="bingo-heading">
        <div>
          <p className="eyebrow">Shared by {result.owner_display_name}</p>
          <h1>{result.revision.title}</h1>
          <p>This is a read-only snapshot from revision {result.revision.number}.</p>
        </div>
        <div className="share-result-actions">
          <Link className="button button--primary" href={`/bingo/${result.bingo_id}`}>
            Play this bingo
          </Link>
          <button type="button" className="button button--secondary" onClick={shareResult}>
            Share
          </button>
          <button type="button" className="button button--secondary" onClick={copyLink}>
            Copy link
          </button>
        </div>
      </header>
      <BingoBoardView
        revision={result.revision}
        selected={new Set(result.selected_cells)}
        completionStyle={result.revision.completion_style}
        readOnly
      />
      <p className="progress-status">
        {result.selected_cells.length} of {result.revision.cells.length} selected
      </p>
      <p className="share-status" role="status" aria-live="polite">
        {shareStatus}
      </p>
    </main>
  );
}
