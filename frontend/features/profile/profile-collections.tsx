"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";

import { BingoGrid } from "@/components/bingo/bingo-grid";
import { AvatarImage } from "@/components/ui/avatar-image";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage } from "@/lib/api/client";
import type {
  BingoSummary,
  Page,
  ProfilePlayHistoryItem,
  ProfileSharedResultItem,
  PublicUser,
} from "@/lib/api/types";
import { formatLocalDateTime } from "@/lib/date-time";

type ProfileTab = "bingos" | "drafts" | "plays" | "shares" | "followers" | "following";
type Collection =
  | { kind: "bingos" | "drafts"; page: Page<BingoSummary> }
  | { kind: "plays"; page: Page<ProfilePlayHistoryItem> }
  | { kind: "shares"; page: Page<ProfileSharedResultItem> }
  | { kind: "followers" | "following"; page: Page<PublicUser> };

const tabs: Array<{ id: ProfileTab; label: string }> = [
  { id: "bingos", label: "Created" },
  { id: "drafts", label: "Drafts" },
  { id: "plays", label: "Recent plays" },
  { id: "shares", label: "Shared results" },
  { id: "followers", label: "Followers" },
  { id: "following", label: "Following" },
];

const ownEmptyStates: Record<
  ProfileTab,
  { title: string; description: string; action?: { href: string; label: string } }
> = {
  bingos: {
    title: "No published bingos yet",
    description: "Create a board and publish it when you are ready for others to play.",
    action: { href: "/create", label: "Create a bingo" },
  },
  drafts: {
    title: "No drafts yet",
    description: "Start a bingo and save it to keep working on it later.",
    action: { href: "/create", label: "Create a bingo" },
  },
  plays: {
    title: "No plays yet",
    description: "Pick a community board and mark the cells that apply to you.",
    action: { href: "/discover", label: "Find a bingo" },
  },
  shares: {
    title: "No shared results yet",
    description: "After playing a board, share your result to keep it here.",
    action: { href: "/discover", label: "Find a bingo" },
  },
  followers: {
    title: "No followers yet",
    description: "People who follow your profile will appear here.",
  },
  following: {
    title: "Not following anyone yet",
    description: "Explore community boards and follow an author you like.",
    action: { href: "/discover", label: "Explore bingos" },
  },
};

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
  const visibleTabs = ownProfile ? tabs : tabs.filter((item) => item.id !== "drafts");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const request: Promise<Collection> =
      tab === "bingos" || tab === "drafts"
        ? api.profiles
            .bingos(username, pageNumber, controller.signal, tab === "drafts" ? "draft" : "created")
            .then((page) => ({ kind: tab, page }))
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
      .then((data) => {
        if (!controller.signal.aborted) setCollection(data);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setCollection(null);
          setError(errorMessage(caught));
        }
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
    if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + visibleTabs.length) % visibleTabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % visibleTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = visibleTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = visibleTabs[nextIndex];
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
        {visibleTabs.map((item, index) => (
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
            title={ownProfile ? ownEmptyStates[tab].title : "Nothing visible here"}
            description={
              ownProfile
                ? ownEmptyStates[tab].description
                : "This section is empty or hidden by its privacy setting."
            }
            action={ownProfile ? ownEmptyStates[tab].action : undefined}
          />
        ) : null}
        {(collection?.kind === "bingos" || collection?.kind === "drafts") &&
        collection.page.results.length ? (
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
                  <time dateTime={item.updated_at}>{formatLocalDateTime(item.updated_at)}</time>
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
                  <time dateTime={item.created_at}>{formatLocalDateTime(item.created_at)}</time>
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
                    <AvatarImage
                      src={avatarUrl}
                      width={44}
                      height={44}
                      loading="lazy"
                      fallback={
                        <span aria-hidden="true">
                          {(person.display_name || person.username).slice(0, 1).toUpperCase()}
                        </span>
                      }
                    />
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
            onClick={() => {
              setCollection(null);
              setPageNumber((value) => Math.max(1, value - 1));
            }}
          >
            Previous
          </button>
          <span>Page {pageNumber}</span>
          <button
            type="button"
            className="button button--secondary"
            disabled={!page.next || loading}
            onClick={() => {
              setCollection(null);
              setPageNumber((value) => value + 1);
            }}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
