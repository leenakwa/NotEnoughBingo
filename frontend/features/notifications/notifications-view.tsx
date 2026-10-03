"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/ui/page-state";
import { api, errorMessage, isAuthenticationRequiredError } from "@/lib/api/client";
import {
  AUTH_SIGNED_IN_EVENT,
  AUTH_SESSION_ENDED_EVENT,
  AUTH_SIGNED_OUT_EVENT,
} from "@/lib/auth-events";
import type { Notification, Page } from "@/lib/api/types";
import { formatLocalDateTime } from "@/lib/date-time";

export function NotificationsView() {
  const [result, setResult] = useState<Page<Notification> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const actionLifetime = useRef(0);
  const markAllInFlight = useRef(false);
  const readsInFlight = useRef(new Set<string>());

  useEffect(() => {
    const refresh = () => {
      actionLifetime.current += 1;
      markAllInFlight.current = false;
      readsInFlight.current.clear();
      setResult(null);
      setPending(false);
      setError("");
      setLoading(true);
      setPage(1);
      setLoadVersion((version) => version + 1);
    };
    window.addEventListener(AUTH_SIGNED_IN_EVENT, refresh);
    window.addEventListener(AUTH_SESSION_ENDED_EVENT, refresh);
    window.addEventListener(AUTH_SIGNED_OUT_EVENT, refresh);
    return () => {
      window.removeEventListener(AUTH_SIGNED_IN_EVENT, refresh);
      window.removeEventListener(AUTH_SESSION_ENDED_EVENT, refresh);
      window.removeEventListener(AUTH_SIGNED_OUT_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const readRequests = readsInFlight.current;
    actionLifetime.current += 1;
    markAllInFlight.current = false;
    readRequests.clear();
    setPending(false);
    setResult(null);
    setLoading(true);
    setError("");
    setAuthRequired(false);
    api.notifications
      .list(page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        if (isAuthenticationRequiredError(caught)) {
          setResult(null);
          setAuthRequired(true);
        } else {
          setResult(null);
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      actionLifetime.current += 1;
      markAllInFlight.current = false;
      readRequests.clear();
    };
  }, [loadVersion, page]);

  function showActionError(caught: unknown) {
    if (isAuthenticationRequiredError(caught)) {
      setResult(null);
      setAuthRequired(true);
      setError("");
    } else {
      setError(errorMessage(caught));
    }
  }

  async function markRead(notification: Notification) {
    if (
      notification.read_at ||
      loading ||
      markAllInFlight.current ||
      readsInFlight.current.has(notification.id)
    )
      return;
    readsInFlight.current.add(notification.id);
    const lifetime = actionLifetime.current;
    setError("");
    try {
      const updated = await api.notifications.markRead(notification.id);
      if (lifetime !== actionLifetime.current) return;
      setResult((current) =>
        current
          ? {
              ...current,
              results: current.results.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current,
      );
    } catch (caught) {
      if (lifetime === actionLifetime.current) showActionError(caught);
    } finally {
      if (lifetime === actionLifetime.current) readsInFlight.current.delete(notification.id);
    }
  }

  async function markAllRead() {
    if (markAllInFlight.current || loading || !result) return;
    markAllInFlight.current = true;
    const lifetime = actionLifetime.current;
    setPending(true);
    setError("");
    try {
      await api.notifications.markAllRead();
      if (lifetime !== actionLifetime.current) return;
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
      if (lifetime === actionLifetime.current) showActionError(caught);
    } finally {
      if (lifetime === actionLifetime.current) {
        markAllInFlight.current = false;
        setPending(false);
      }
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
          disabled={loading || pending || !result?.results.some((item) => !item.read_at)}
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
                  {formatLocalDateTime(notification.created_at)}
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
            onClick={() => {
              setResult(null);
              setPage((value) => Math.max(1, value - 1));
            }}
          >
            Previous
          </button>
          <span>Page {page}</span>
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
