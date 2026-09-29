"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { BingoGrid } from "@/components/bingo/bingo-grid";
import { LanguagePicker } from "@/components/ui/language-picker";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import type { BingoSummary, OwnUserProfile, Page } from "@/lib/api/types";
import { bingoLanguages } from "@/lib/languages";

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
  const [profile, setProfile] = useState<OwnUserProfile | null>(null);
  const [languageFilter, setLanguageFilter] = useState<string[] | null>(null);
  const [onboardingLanguages, setOnboardingLanguages] = useState<string[]>([]);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferenceError, setPreferenceError] = useState("");
  const skipInitialRequest = useRef(Boolean(initialResult));

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const data =
          kind === "discover"
            ? await api.feeds.discover(page, signal, languageFilter)
            : await api.feeds.trending(page, signal);
        setResult(data);
      } catch (caught) {
        if (!signal.aborted) setError(errorMessage(caught));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [kind, page, languageFilter],
  );

  useEffect(() => {
    if (skipInitialRequest.current) {
      skipInitialRequest.current = false;
      return;
    }
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, requestVersion]);

  useEffect(() => {
    if (kind !== "discover") return;
    let active = true;
    api.auth
      .session()
      .then((user) => (user ? api.profiles.me() : null))
      .then((value) => {
        if (!active || !value) return;
        setProfile(value);
        const browserCode = navigator.language.slice(0, 2).toLowerCase();
        setOnboardingLanguages(
          value.preferred_languages.length
            ? value.preferred_languages
            : [bingoLanguages.find((language) => language.code === browserCode)?.code ?? "en"],
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [kind]);

  async function saveLanguagePreferences() {
    if (!onboardingLanguages.length || savingPreferences) return;
    setSavingPreferences(true);
    setPreferenceError("");
    try {
      const updated = await api.profiles.update({ preferred_languages: onboardingLanguages });
      setProfile(updated);
      setLanguageFilter(updated.preferred_languages);
      setPage(1);
    } catch (caught) {
      setPreferenceError(errorMessage(caught));
    } finally {
      setSavingPreferences(false);
    }
  }

  const selectedLanguages = languageFilter ?? profile?.preferred_languages ?? [];

  return (
    <main id="main-content" className="page-shell" aria-busy={loading}>
      <header className="page-heading">
        <p className="eyebrow">Community boards</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      {kind === "discover" ? (
        <>
          {profile && !profile.language_preferences_confirmed ? (
            <section className="language-onboarding" aria-labelledby="language-onboarding-title">
              <h2 id="language-onboarding-title">Which bingo languages do you prefer?</h2>
              <p>Choose one or more. You can change this later in your profile.</p>
              <LanguagePicker
                value={onboardingLanguages}
                onChange={setOnboardingLanguages}
                label="Preferred languages"
                disabled={savingPreferences}
              />
              <button
                type="button"
                className="button button--primary"
                disabled={!onboardingLanguages.length || savingPreferences}
                onClick={() => void saveLanguagePreferences()}
              >
                {savingPreferences ? "Saving…" : "Save preferences"}
              </button>
              {preferenceError ? (
                <p role="alert" className="form-message form-message--error">
                  {preferenceError}
                </p>
              ) : null}
            </section>
          ) : null}
          <details className="language-filter">
            <summary>
              Languages: {selectedLanguages.length ? `${selectedLanguages.length} selected` : "All"}
            </summary>
            <LanguagePicker
              value={selectedLanguages}
              label="Show bingos in"
              onChange={(next) => {
                setLanguageFilter(next);
                setPage(1);
                setResult(null);
              }}
            />
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setLanguageFilter([]);
                setPage(1);
                setResult(null);
              }}
            >
              Show all languages
            </button>
          </details>
        </>
      ) : null}

      {kind === "discover" ? (
        <aside className="product-intro" aria-label="How Not Enough Bingo works">
          <div>
            <p className="eyebrow">New here?</p>
            <h2>Pick a board. Tap what applies. Share the result.</h2>
            <p>You can play public boards as a guest, then make your own whenever you are ready.</p>
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
          title={
            kind === "discover" && selectedLanguages.length
              ? "No bingos in these languages"
              : "No boards here yet"
          }
          description={
            kind === "discover" && selectedLanguages.length
              ? "Choose more languages above, or select Show all languages."
              : "Published community boards will appear here."
          }
          action={
            selectedLanguages.length ? undefined : { href: "/create", label: "Create a bingo" }
          }
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
