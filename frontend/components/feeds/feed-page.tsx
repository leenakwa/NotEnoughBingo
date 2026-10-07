"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BingoGrid } from "@/components/bingo/bingo-grid";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import type { BingoSummary, Page } from "@/lib/api/types";
import { AUTH_SIGNED_IN_EVENT } from "@/lib/auth-events";
import { LANGUAGE_PREFERENCES_CHANGED_EVENT } from "@/lib/registration-onboarding";

type FeedKind = "discover" | "trending";

export function FeedPage({
  kind,
  title,
  description,
  initialResult,
}: {
  kind: FeedKind;
  title: string;
  description: string;
  initialResult?: Page<BingoSummary> | null;
}) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<BingoSummary> | null>(initialResult ?? null);
  const [loading, setLoading] = useState(!initialResult);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const skipInitialRequest = useRef(Boolean(initialResult));

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const data =
          kind === "discover"
            ? await api.feeds.discover(page, signal)
            : await api.feeds.trending(page, signal);
        if (!signal.aborted) setResult(data);
      } catch (caught) {
        if (!signal.aborted) {
          setResult(null);
          setError(errorMessage(caught));
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [kind, page],
  );

  useEffect(() => {
    let controller: AbortController | undefined;
    if (skipInitialRequest.current) {
      skipInitialRequest.current = false;
    } else {
      controller = new AbortController();
      void load(controller.signal);
    }

    const cancel = () => controller?.abort();
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setRequestVersion((value) => value + 1);
    };
    window.addEventListener("pagehide", cancel);
    window.addEventListener("pageshow", restore);
    return () => {
      cancel();
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("pageshow", restore);
    };
  }, [load, requestVersion]);

  useEffect(() => {
    if (kind !== "discover") return;
    const refresh = () => {
      setPage(1);
      setResult(null);
      setRequestVersion((value) => value + 1);
    };
    window.addEventListener(AUTH_SIGNED_IN_EVENT, refresh);
    window.addEventListener(LANGUAGE_PREFERENCES_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(AUTH_SIGNED_IN_EVENT, refresh);
      window.removeEventListener(LANGUAGE_PREFERENCES_CHANGED_EVENT, refresh);
    };
  }, [kind]);

  return (
    <main id="main-content" className="page-shell" aria-busy={loading}>
      <header className="page-heading">
        <p className="eyebrow">Community boards</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      {kind === "discover" ? (
        <aside className="product-intro hover-lift" aria-label="How Not Enough Bingo works">
          <div>
            <p className="eyebrow">New here?</p>
            <h2>Pick a board. Tap what applies. Share the result.</h2>
            <p>Free to play as a guest. Sign up to make your own board.</p>
          </div>
          <div className="inline-actions">
            <Link className="button button--primary" href="/explore">
              Find a bingo
            </Link>
            <Link className="button button--secondary" href="/create">
              Create your own
            </Link>
          </div>
        </aside>
      ) : null}

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
            onClick={() => {
              setResult(null);
              setPage((value) => Math.max(1, value - 1));
            }}
          >
            Previous
          </button>
          <span aria-live="polite">Page {page}</span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.next || loading}
            onClick={() => {
              setResult(null);
              setPage((value) => value + 1);
            }}
          >
            Next
          </button>
        </nav>
      ) : null}
    </main>
  );
}
