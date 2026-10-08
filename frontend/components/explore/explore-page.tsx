"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BingoGrid } from "@/components/bingo/bingo-grid";
import { SearchIcon } from "@/components/ui/icons";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import { trackInteraction } from "@/lib/analytics";
import type { AuthorSuggestion, BingoSummary, Page, Tag } from "@/lib/api/types";
import { languageLabel } from "@/lib/languages";

function searchKey(
  search: string,
  author: string,
  tags: string,
  languages: string[],
  ordering: string,
  page: number,
) {
  return JSON.stringify([
    search.trim(),
    author.trim(),
    tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    languages,
    ordering,
    page,
  ]);
}

export function ExplorePage({ initialResult }: { initialResult?: Page<BingoSummary> | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const appliedSearch = searchParams.get("search") ?? "";
  const appliedAuthor = searchParams.get("author") ?? "";
  const appliedTags = searchParams.get("tags") ?? "";
  const appliedLanguagesKey = searchParams.getAll("languages").join(",");
  const appliedLanguages = useMemo(
    () => appliedLanguagesKey.split(",").filter(Boolean),
    [appliedLanguagesKey],
  );
  const appliedOrdering =
    searchParams.get("ordering") === "newest" ? ("newest" as const) : ("popular" as const);
  const rawPage = Number(searchParams.get("page"));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const appliedKey = searchKey(
    appliedSearch,
    appliedAuthor,
    appliedTags,
    appliedLanguages,
    appliedOrdering,
    page,
  );
  const [search, setSearch] = useState(appliedSearch);
  const [author, setAuthor] = useState(appliedAuthor);
  const [tags, setTags] = useState(appliedTags);
  const [ordering, setOrdering] = useState<"popular" | "newest">(appliedOrdering);
  const [result, setResult] = useState<Page<BingoSummary> | null>(initialResult ?? null);
  const [loading, setLoading] = useState(!initialResult);
  const [error, setError] = useState("");
  const [tagError, setTagError] = useState("");
  const [authorSuggestions, setAuthorSuggestions] = useState<AuthorSuggestion[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([]);
  const [requestVersion, setRequestVersion] = useState(0);
  const [interactive, setInteractive] = useState(false);
  const skipInitialRequest = useRef(Boolean(initialResult));
  const pendingSubmission = useRef<{
    key: string;
    previousKeys: string[];
    targetApplied: boolean;
  } | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInteractive(true);
  }, []);

  const load = useCallback(
    async (signal: AbortSignal) => {
      const submission = pendingSubmission.current;
      setLoading(true);
      setError("");
      try {
        const data = await api.bingos.explore(
          {
            search: appliedSearch,
            author: appliedAuthor,
            tags: appliedTags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
            languages: appliedLanguages,
            ordering: appliedOrdering,
            page,
          },
          signal,
        );
        if (!signal.aborted) setResult(data);
      } catch (caught) {
        if (!signal.aborted) {
          setResult(null);
          setError(errorMessage(caught));
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
          if (submission?.key === appliedKey && pendingSubmission.current === submission) {
            pendingSubmission.current = null;
          }
        }
      }
    },
    [
      appliedAuthor,
      appliedOrdering,
      appliedSearch,
      appliedTags,
      appliedLanguages,
      appliedKey,
      page,
    ],
  );

  useEffect(() => {
    const submission = pendingSubmission.current;
    if (submission) {
      if (appliedKey === submission.key) {
        submission.targetApplied = true;
      } else if (submission.targetApplied || !submission.previousKeys.includes(appliedKey)) {
        pendingSubmission.current = null;
      }
    }
    if (skipInitialRequest.current) {
      skipInitialRequest.current = false;
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, requestVersion, appliedKey]);

  useEffect(() => {
    setSearch(appliedSearch);
    setAuthor(appliedAuthor);
    setTags(appliedTags);
    setTagError("");
    setOrdering(appliedOrdering);
  }, [appliedAuthor, appliedOrdering, appliedSearch, appliedTags, appliedLanguages]);

  useEffect(() => {
    const query = author.trim();
    setAuthorSuggestions([]);
    if (!query) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.authors
        .list(query, 1, controller.signal)
        .then((page) => {
          if (!controller.signal.aborted) setAuthorSuggestions(page.results.slice(0, 10));
        })
        .catch(() => {
          if (!controller.signal.aborted) setAuthorSuggestions([]);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [author]);

  useEffect(() => {
    const query = tags.split(",").at(-1)?.trim() ?? "";
    setTagSuggestions([]);
    if (!query) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.tags
        .list(query, 1, controller.signal)
        .then((page) => {
          if (!controller.signal.aborted) setTagSuggestions(page.results.slice(0, 10));
        })
        .catch(() => {
          if (!controller.signal.aborted) setTagSuggestions([]);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tags]);

  function updateUrl(
    nextPage: number,
    filters = { search, author, tags, languages: appliedLanguages, ordering },
  ) {
    const next = new URLSearchParams();
    if (filters.search.trim()) next.set("search", filters.search.trim());
    if (filters.author.trim()) next.set("author", filters.author.trim());
    if (filters.tags.trim()) next.set("tags", filters.tags.trim());
    for (const language of filters.languages) next.append("languages", language);
    if (filters.ordering !== "popular") next.set("ordering", filters.ordering);
    if (nextPage > 1) next.set("page", String(nextPage));
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ""}`, {
      scroll: false,
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!interactive) return;
    const selectedTags = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (selectedTags.length > 15 || selectedTags.some((tag) => tag.length > 50)) {
      setTagError(
        selectedTags.length > 15
          ? "Choose at most 15 tags."
          : "Each tag must be at most 50 characters.",
      );
      tagInputRef.current?.focus();
      return;
    }
    const key = searchKey(search, author, tags, appliedLanguages, ordering, 1);
    if (pendingSubmission.current?.key === key) return;
    const previous = pendingSubmission.current;
    pendingSubmission.current = {
      key,
      previousKeys: previous ? [...previous.previousKeys, previous.key, appliedKey] : [appliedKey],
      targetApplied: key === appliedKey,
    };
    setTagError("");
    if (search.trim()) {
      trackInteraction("search", {
        metadata: {
          surface: "explore",
          ordering,
        },
      });
    }
    updateUrl(1);
    setRequestVersion((value) => value + 1);
  }

  function changePage(nextPage: number) {
    pendingSubmission.current = null;
    updateUrl(nextPage, {
      search: appliedSearch,
      author: appliedAuthor,
      tags: appliedTags,
      languages: appliedLanguages,
      ordering: appliedOrdering,
    });
  }

  function removeFilter(filter: "search" | "author" | "ordering" | "tag" | "language", tag = "") {
    pendingSubmission.current = null;
    const next = {
      search: filter === "search" ? "" : appliedSearch,
      author: filter === "author" ? "" : appliedAuthor,
      tags:
        filter === "tag"
          ? appliedTags
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value && value.toLocaleLowerCase() !== tag.toLocaleLowerCase())
              .join(", ")
          : appliedTags,
      languages:
        filter === "language" ? appliedLanguages.filter((code) => code !== tag) : appliedLanguages,
      ordering: filter === "ordering" ? ("popular" as const) : appliedOrdering,
    };
    setSearch(next.search);
    setAuthor(next.author);
    setTags(next.tags);
    setOrdering(next.ordering);
    updateUrl(1, next);
  }

  const tagPrefix = tags
    .split(",")
    .slice(0, -1)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return (
    <main id="main-content" className="page-shell" aria-busy={loading}>
      <header className="page-heading">
        <p className="eyebrow">Public catalog</p>
        <h1>Explore</h1>
        <p>Search every public bingo by title, author, or tag.</p>
      </header>

      <form onSubmit={submit}>
        <fieldset
          className="filter-panel hover-lift"
          disabled={!interactive}
          aria-busy={!interactive}
        >
          <legend className="sr-only">Search filters</legend>
          <label className="field">
            <span>Search by title</span>
            <span className="input-with-icon">
              <SearchIcon />
              <input
                type="search"
                name="search"
                autoComplete="off"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Enter a title"
                maxLength={80}
              />
            </span>
          </label>
          <label className="field">
            <span>Author</span>
            <input
              type="search"
              name="author"
              autoComplete="off"
              spellCheck={false}
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Username or display name"
              list="explore-author-suggestions"
              maxLength={80}
            />
            <datalist id="explore-author-suggestions">
              {authorSuggestions.map((suggestion) => (
                <option
                  key={suggestion.id}
                  value={suggestion.username}
                  label={
                    suggestion.display_name
                      ? `${suggestion.display_name} (@${suggestion.username})`
                      : `@${suggestion.username}`
                  }
                />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span id="explore-tags-label">Tags</span>
            <input
              ref={tagInputRef}
              type="search"
              name="tags"
              aria-labelledby="explore-tags-label"
              aria-describedby={
                tagError ? "explore-tags-help explore-tags-error" : "explore-tags-help"
              }
              aria-invalid={Boolean(tagError)}
              autoComplete="off"
              value={tags}
              onChange={(event) => {
                setTags(event.target.value);
                setTagError("");
              }}
              placeholder="travel, friends"
              list="explore-tag-suggestions"
            />
            <small id="explore-tags-help">Up to 15 tags, separated by commas.</small>
            {tagError ? (
              <small id="explore-tags-error" className="form-message--error" role="alert">
                {tagError}
              </small>
            ) : null}
            <datalist id="explore-tag-suggestions">
              {tagSuggestions.map((tag) => (
                <option key={tag.id} value={[...tagPrefix, tag.slug].join(", ")}>
                  {tag.name}
                </option>
              ))}
            </datalist>
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
          {appliedSearch ||
          appliedAuthor ||
          appliedTags ||
          appliedLanguages.length ||
          appliedOrdering !== "popular" ? (
            <button
              className="button button--secondary filter-clear"
              type="button"
              onClick={() => {
                pendingSubmission.current = null;
                setSearch("");
                setAuthor("");
                setTags("");
                setOrdering("popular");
                router.replace(pathname, { scroll: false });
              }}
            >
              Clear all filters
            </button>
          ) : null}
        </fieldset>
      </form>

      {appliedSearch ||
      appliedAuthor ||
      appliedTags ||
      appliedLanguages.length ||
      appliedOrdering !== "popular" ? (
        <div className="active-filters" role="group" aria-label="Active filters">
          {appliedSearch ? (
            <button
              type="button"
              disabled={!interactive}
              onClick={() => removeFilter("search")}
              aria-label={`Remove title filter: ${appliedSearch}`}
            >
              Title: {appliedSearch} <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {appliedAuthor ? (
            <button
              type="button"
              disabled={!interactive}
              onClick={() => removeFilter("author")}
              aria-label={`Remove author filter: ${appliedAuthor}`}
            >
              Author: {appliedAuthor} <span aria-hidden="true">×</span>
            </button>
          ) : null}
          {appliedTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .map((tag) => (
              <button
                key={tag}
                type="button"
                disabled={!interactive}
                onClick={() => removeFilter("tag", tag)}
                aria-label={`Remove tag filter: ${tag}`}
              >
                #{tag} <span aria-hidden="true">×</span>
              </button>
            ))}
          {appliedLanguages.map((code) => (
            <button
              key={code}
              type="button"
              disabled={!interactive}
              onClick={() => removeFilter("language", code)}
              aria-label={`Remove language filter: ${languageLabel(code)}`}
            >
              {languageLabel(code)} <span aria-hidden="true">×</span>
            </button>
          ))}
          {appliedOrdering === "newest" ? (
            <button
              type="button"
              disabled={!interactive}
              onClick={() => removeFilter("ordering")}
              aria-label="Remove newest-first sorting"
            >
              Newest first <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
      ) : null}

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
            disabled={!interactive || !result.previous || loading}
            onClick={() => changePage(Math.max(1, page - 1))}
          >
            Previous
          </button>
          <span>Page {page}</span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!interactive || !result.next || loading}
            onClick={() => changePage(page + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </main>
  );
}
