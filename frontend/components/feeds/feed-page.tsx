"use client";

import { useCallback, useEffect, useState } from "react";

import { BingoGrid } from "@/components/bingo/bingo-grid";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import type { BingoSummary, Page } from "@/lib/api/types";

type FeedKind = "discover" | "trending";

export function FeedPage({
  kind,
  title,
  description,
}: {
  kind: FeedKind;
  title: string;
  description: string;
}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<BingoSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const data =
          kind === "discover"
            ? await api.feeds.discover(page, signal)
            : await api.feeds.trending(page, signal);
        setResult(data);
      } catch (caught) {
        if (!signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [kind, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, requestVersion]);

  return (
    <main id="main-content" className="page-shell" aria-busy={loading}>
      <header className="page-heading">
        <p className="eyebrow">Community boards</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      {loading && !result ? <LoadingState label={`Loading ${title.toLowerCase()}…`} /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => setRequestVersion((value) => value + 1)} />
      ) : null}
      {!loading && !error && result?.results.length === 0 ? (
        <EmptyState
          title="No boards here yet"
          description="Published community boards will appear here."
          action={{ href: "/create", label: "Create a bingo" }}
        />
      ) : null}
      {result?.results.length ? <BingoGrid bingos={result.results} /> : null}
      {loading && result ? (
        <p className="results-count" role="status">
          Updating boards…
        </p>
      ) : null}

      {result && (result.previous || result.next) ? (
        <nav className="pagination" aria-label={`${title} pages`}>
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.previous || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span aria-live="polite">Page {page}</span>
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
    </main>
  );
}
