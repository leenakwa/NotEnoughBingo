"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

import { BingoGrid } from "@/components/bingo/bingo-grid";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import type {
  BingoSummary,
  Page,
  ProfilePlayHistoryItem,
  ProfileSharedResultItem,
  PublicUser,
} from "@/lib/api/types";

type ProfileTab = "bingos" | "plays" | "shares" | "followers" | "following";
type Collection =
  | { kind: "bingos"; page: Page<BingoSummary> }
  | { kind: "plays"; page: Page<ProfilePlayHistoryItem> }
  | { kind: "shares"; page: Page<ProfileSharedResultItem> }
  | { kind: "followers" | "following"; page: Page<PublicUser> };

const tabs: Array<{ id: ProfileTab; label: string }> = [
  { id: "bingos", label: "Created" },
  { id: "plays", label: "Recent plays" },
  { id: "shares", label: "Shared results" },
  { id: "followers", label: "Followers" },
  { id: "following", label: "Following" },
];

export function ProfileCollections({
  username,
  ownProfile,
}: {
  username: string;
  ownProfile: boolean;
}) {
  const [tab, setTab] = useState<ProfileTab>("bingos");
  const [pageNumber, setPageNumber] = useState(1);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const request: Promise<Collection> =
      tab === "bingos"
        ? api.profiles
            .bingos(username, pageNumber, controller.signal)
            .then((page) => ({ kind: "bingos", page }))
        : tab === "plays"
          ? api.profiles
              .playHistory(username, pageNumber, controller.signal)
              .then((page) => ({ kind: "plays", page }))
          : tab === "shares"
            ? api.profiles
                .sharedResults(username, pageNumber, controller.signal)
                .then((page) => ({ kind: "shares", page }))
            : tab === "followers"
              ? api.profiles
                  .followers(username, pageNumber, controller.signal)
                  .then((page) => ({ kind: "followers", page }))
              : api.profiles
                  .following(username, pageNumber, controller.signal)
                  .then((page) => ({ kind: "following", page }));
    request
      .then(setCollection)
      .catch((caught) => {
        if (!controller.signal.aborted) setError(errorMessage(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [pageNumber, retry, tab, username]);

  const page = collection?.page;

  function activateTab(nextTab: ProfileTab) {
    setTab(nextTab);
    setPageNumber(1);
    setCollection(null);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    activateTab(nextTab.id);
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelector<HTMLButtonElement>(`[data-tab-id="${nextTab.id}"]`)
      ?.focus();
  }

  return (
    <section className="profile-section" aria-labelledby="profile-content-title">
      <h2 id="profile-content-title">Profile activity</h2>
      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            id={`profile-tab-${item.id}`}
            type="button"
            role="tab"
            data-tab-id={item.id}
            aria-selected={tab === item.id}
            aria-controls="profile-tab-panel"
            tabIndex={tab === item.id ? 0 : -1}
            className="button button--secondary"
            onClick={() => activateTab(item.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        id="profile-tab-panel"
        role="tabpanel"
        aria-labelledby={`profile-tab-${tab}`}
        aria-busy={loading}
        className="profile-tab-panel"
      >
        {loading && !collection ? <LoadingState label="Loading profile activity…" /> : null}
        {error ? (
          <ErrorState message={error} onRetry={() => setRetry((value) => value + 1)} />
        ) : null}
        {!loading && !error && page?.results.length === 0 ? (
          <EmptyState
            title="Nothing visible here"
            description={
              ownProfile
                ? "Activity will appear here as you use Not Enough Bingo."
                : "This section is empty or hidden by its privacy setting."
            }
            action={
              ownProfile && tab === "bingos"
                ? { href: "/create", label: "Create a bingo" }
                : undefined
            }
          />
        ) : null}
        {collection?.kind === "bingos" && collection.page.results.length ? (
          <BingoGrid bingos={collection.page.results} />
        ) : null}
        {collection?.kind === "plays" && collection.page.results.length ? (
          <ol className="profile-activity-list">
            {collection.page.results.map((item) => (
              <li key={item.public_id}>
                <Link href={`/bingo/${item.bingo_id}`}>
                  <b>{item.bingo_title}</b>
                  <span>
                    Revision {item.revision_number} · {item.selected_count} selected
                  </span>
                  <time dateTime={item.updated_at}>
                    {new Date(item.updated_at).toLocaleString()}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
        {collection?.kind === "shares" && collection.page.results.length ? (
          <ol className="profile-activity-list">
            {collection.page.results.map((item) => (
              <li key={item.id}>
                <Link href={item.share_url}>
                  <b>{item.bingo_title}</b>
                  <span>
                    Revision {item.revision_number} · {item.selected_count} selected
                  </span>
                  <time dateTime={item.created_at}>
                    {new Date(item.created_at).toLocaleString()}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
        {(collection?.kind === "followers" || collection?.kind === "following") &&
        collection.page.results.length ? (
          <ul className="people-list">
            {collection.page.results.map((person) => {
              const avatarUrl = person.avatar?.thumbnail_url ?? person.avatar?.url ?? undefined;
              return (
                <li key={person.id}>
                  <Link href={`/profile/${person.username}`}>
                    {avatarUrl ? (
                      // The backend serves validated raster avatars.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt="" width={44} height={44} />
                    ) : (
                      <span aria-hidden="true">
                        {(person.display_name || person.username).slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span>
                      <b>{person.display_name || person.username}</b>
                      <small>@{person.username}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {page && (page.previous || page.next) ? (
        <nav className="pagination" aria-label="Profile activity pages">
          <button
            type="button"
            className="button button--secondary"
            disabled={!page.previous || loading}
            onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span>Page {pageNumber}</span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!page.next || loading}
            onClick={() => setPageNumber((value) => value + 1)}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
