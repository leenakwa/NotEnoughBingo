"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { BingoGrid } from "@/components/bingo/bingo-grid";
import { SearchIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import { trackInteraction } from "@/lib/analytics";
import type { BingoSummary, Page } from "@/lib/api/types";

export function ExplorePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const appliedSearch = searchParams.get("search") ?? "";
  const appliedAuthor = searchParams.get("author") ?? "";
  const appliedTags = searchParams.get("tags") ?? "";
  const appliedOrdering =
    searchParams.get("ordering") === "newest" ? ("newest" as const) : ("popular" as const);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const [search, setSearch] = useState(appliedSearch);
  const [author, setAuthor] = useState(appliedAuthor);
  const [tags, setTags] = useState(appliedTags);
  const [ordering, setOrdering] = useState<"popular" | "newest">(appliedOrdering);
  const [result, setResult] = useState<Page<BingoSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        setResult(
          await api.bingos.explore(
            {
              search: appliedSearch,
              author: appliedAuthor,
              tags: appliedTags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
              ordering: appliedOrdering,
              page,
            },
            signal,
          ),
        );
      } catch (caught) {
        if (!signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [appliedAuthor, appliedOrdering, appliedSearch, appliedTags, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, requestVersion]);

  useEffect(() => {
    setSearch(appliedSearch);
    setAuthor(appliedAuthor);
    setTags(appliedTags);
    setOrdering(appliedOrdering);
  }, [appliedAuthor, appliedOrdering, appliedSearch, appliedTags]);

  function updateUrl(nextPage: number, filters = { search, author, tags, ordering }) {
    const next = new URLSearchParams();
    if (filters.search.trim()) next.set("search", filters.search.trim());
    if (filters.author.trim()) next.set("author", filters.author.trim());
    if (filters.tags.trim()) next.set("tags", filters.tags.trim());
    if (filters.ordering !== "popular") next.set("ordering", filters.ordering);
    if (nextPage > 1) next.set("page", String(nextPage));
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, {
      scroll: false,
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (search.trim()) {
      trackInteraction("search", {
        query: search.trim(),
        metadata: {
          author: author.trim(),
          tags: tags.trim(),
          ordering,
        },
      });
    }
    updateUrl(1);
    setRequestVersion((value) => value + 1);
  }

  function changePage(nextPage: number) {
    updateUrl(nextPage, {
      search: appliedSearch,
      author: appliedAuthor,
      tags: appliedTags,
      ordering: appliedOrdering,
    });
  }

  return (
    <main id="main-content" className="page-shell" aria-busy={loading}>
      <header className="page-heading">
        <p className="eyebrow">Public catalog</p>
        <h1>Explore</h1>
        <p>Search every public bingo by title, author, or tag.</p>
      </header>

      <form className="filter-panel" onSubmit={submit}>
        <label className="field">
          <span>Search by title</span>
          <span className="input-with-icon">
            <SearchIcon />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Enter a title"
            />
          </span>
        </label>
        <label className="field">
          <span>Author</span>
          <input
            type="search"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="Username or display name"
          />
        </label>
        <label className="field">
          <span>Tags</span>
          <input
            type="search"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="travel, friends"
          />
        </label>
        <fieldset className="sort-options">
          <legend>Sort</legend>
          <label>
            <input
              type="radio"
              name="ordering"
              value="popular"
              checked={ordering === "popular"}
              onChange={() => setOrdering("popular")}
            />
            <span>
              <b>Popular</b>
              <small>Engagement with time decay</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="ordering"
              value="newest"
              checked={ordering === "newest"}
              onChange={() => setOrdering("newest")}
            />
            <span>
              <b>New</b>
              <small>Recently published</small>
            </span>
          </label>
        </fieldset>
        <button className="button button--primary filter-submit" type="submit">
          Search
        </button>
      </form>

      {loading && !result ? <LoadingState label="Searching bingos…" /> : null}
      {error ? (
        <ErrorState message={error} onRetry={() => setRequestVersion((value) => value + 1)} />
      ) : null}
      {!loading && !error && result?.results.length === 0 ? (
        <EmptyState
          title="No matching bingos"
          description="Try fewer filters or a different search phrase."
        />
      ) : null}
      {result ? (
        <p className="results-count" aria-live="polite">
          {loading
            ? "Updating results…"
            : `${result.count} ${result.count === 1 ? "result" : "results"}`}
        </p>
      ) : null}
      {result?.results.length ? <BingoGrid bingos={result.results} /> : null}
      {result && (result.previous || result.next) ? (
        <nav className="pagination" aria-label="Explore pages">
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.previous || loading}
            onClick={() => changePage(Math.max(1, page - 1))}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.next || loading}
            onClick={() => changePage(page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </main>
  );
}
