"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BingoBoardView } from "@/components/bingo/bingo-board-view";
import { ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import type { SharedResult } from "@/lib/api/types";

export function SharedResultView({ bingoId, shareId }: { bingoId: string; shareId: string }) {
  const [result, setResult] = useState<SharedResult | null>(null);
  const [error, setError] = useState("");
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api.shares
      .get(bingoId, shareId, controller.signal)
      .then(setResult)
      .catch((caught) => {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      });
    return () => controller.abort();
  }, [bingoId, loadVersion, shareId]);

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
        <Link className="button button--primary" href={`/bingo/${result.bingo_id}`}>
          Play this bingo
        </Link>
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
    </main>
  );
}
