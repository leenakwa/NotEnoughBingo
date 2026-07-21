"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage, isAuthenticationRequiredError } from "@/lib/api/client";
import type { Notification, Page } from "@/lib/api/types";

export function NotificationsView() {
  const [result, setResult] = useState<Page<Notification> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setAuthRequired(false);
    api.notifications
      .list(page, controller.signal)
      .then(setResult)
      .catch((caught) => {
        if (controller.signal.aborted) return;
        if (isAuthenticationRequiredError(caught)) {
          setResult(null);
          setAuthRequired(true);
        } else {
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadVersion, page]);

  async function markRead(notification: Notification) {
    if (notification.read_at) return;
    try {
      const updated = await api.notifications.markRead(notification.id);
      setResult((current) =>
        current
          ? {
              ...current,
              results: current.results.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function markAllRead() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await api.notifications.markAllRead();
      const readAt = new Date().toISOString();
      setResult((current) =>
        current
          ? {
              ...current,
              results: current.results.map((item) => ({
                ...item,
                read_at: item.read_at ?? readAt,
              })),
            }
          : current,
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <main id="main-content" className="page-shell notifications-page" aria-busy={loading}>
      <header className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">Your activity</p>
          <h1>Notifications</h1>
        </div>
        <button
          type="button"
          className="button button--secondary"
          disabled={pending || !result?.results.some((item) => !item.read_at)}
          onClick={() => void markAllRead()}
        >
          Mark all as read
        </button>
      </header>
      {loading && !result ? <LoadingState label="Loading notifications…" /> : null}
      {authRequired ? (
        <EmptyState
          title="Log in to view notifications"
          description="Notifications are private to your account."
          action={{
            href: "/login?next=%2Fnotifications",
            label: "Log in",
          }}
        />
      ) : null}
      {error ? (
        <ErrorState message={error} onRetry={() => setLoadVersion((current) => current + 1)} />
      ) : null}
      {!loading && result?.results.length === 0 ? (
        <EmptyState
          title="All quiet"
          description="New comments, likes, replies, and followers will appear here."
        />
      ) : null}
      {result?.results.length ? (
        <ol className="notification-list">
          {result.results.map((notification) => (
            <li key={notification.id} className={notification.read_at ? "" : "is-unread"}>
              <Link href={notification.target_url} onClick={() => void markRead(notification)}>
                <span>{notification.message}</span>
                <time dateTime={notification.created_at}>
                  {new Date(notification.created_at).toLocaleString()}
                </time>
              </Link>
            </li>
          ))}
        </ol>
      ) : null}
      {result && (result.previous || result.next) ? (
        <nav className="pagination" aria-label="Notification pages">
          <button
            type="button"
            className="button button--secondary"
            disabled={!result.previous || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            Previous
          </button>
          <span>Page {page}</span>
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
