"use client";

import { api } from "@/lib/api/client";
import type { ClientInteraction, ClientInteractionType, PublicId } from "@/lib/api/types";

const ANONYMOUS_ID_KEY = "neb:anonymous-id";
const MAX_BATCH_SIZE = 20;
let memoryAnonymousId = "";
const pending: ClientInteraction[] = [];
let flushTimer: number | null = null;

function anonymousId(): string {
  if (memoryAnonymousId) return memoryAnonymousId;
  try {
    const stored = window.localStorage.getItem(ANONYMOUS_ID_KEY);
    if (stored) {
      memoryAnonymousId = stored;
      return stored;
    }
    memoryAnonymousId = crypto.randomUUID();
    window.localStorage.setItem(ANONYMOUS_ID_KEY, memoryAnonymousId);
  } catch {
    memoryAnonymousId = crypto.randomUUID();
  }
  return memoryAnonymousId;
}

async function flush(): Promise<void> {
  flushTimer = null;
  const events = pending.splice(0, MAX_BATCH_SIZE);
  if (!events.length) return;
  try {
    await api.analytics.record(events);
  } catch {
    // Analytics must never interrupt the product action that generated it.
  }
  if (pending.length) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => void flush(), 600);
}

export function trackInteraction(
  eventType: ClientInteractionType,
  options: {
    bingoId?: PublicId;
    revisionId?: PublicId;
    tag?: string;
    query?: string;
    metadata?: Record<string, unknown>;
  } = {},
): void {
  if (typeof window === "undefined") return;
  pending.push({
    client_event_id: crypto.randomUUID(),
    event_type: eventType,
    bingo_id: options.bingoId,
    revision_id: options.revisionId,
    tag: options.tag,
    query: options.query,
    metadata: options.metadata ?? {},
    occurred_at: new Date().toISOString(),
    anonymous_id: anonymousId(),
  });
  if (pending.length >= MAX_BATCH_SIZE) {
    void flush();
  } else {
    scheduleFlush();
  }
}
