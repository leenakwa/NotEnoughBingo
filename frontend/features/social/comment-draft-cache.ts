"use client";

import { AUTH_SIGNED_OUT_EVENT, AUTH_SYNC_KEY } from "@/lib/auth-events";

const maxDrafts = 64;
const retentionMs = 24 * 60 * 60 * 1_000;
const drafts = new Map<string, { body: string; savedAt: number }>();
let owner: string | undefined;
let generation = 0;
let listening = false;
let signOutChannel: BroadcastChannel | undefined;

export function clearCommentDrafts(): void {
  drafts.clear();
  owner = undefined;
  generation += 1;
}

function listenForSignOut(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(AUTH_SIGNED_OUT_EVENT, clearCommentDrafts);
  try {
    if (typeof window.BroadcastChannel !== "undefined") {
      signOutChannel = new window.BroadcastChannel(AUTH_SYNC_KEY);
      signOutChannel.addEventListener("message", (event) => {
        if (event.data === "signed-out") clearCommentDrafts();
      });
    }
  } catch {
    // Fall back to the existing storage signal.
  }
  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_SYNC_KEY && event.newValue?.startsWith("signed-out:")) {
      clearCommentDrafts();
    }
  });
}

export function readCommentDraft(
  accountId: string,
  bingoId: string,
): { body: string; generation: number } {
  if (typeof window === "undefined") return { body: "", generation };
  listenForSignOut();
  if (owner && owner !== accountId) clearCommentDrafts();
  owner = accountId;
  const key = `${accountId}:${bingoId}`;
  const saved = drafts.get(key);
  if (saved && Date.now() - saved.savedAt >= retentionMs) drafts.delete(key);
  return { body: drafts.get(key)?.body ?? "", generation };
}

export function rememberCommentDraft(
  accountId: string,
  bingoId: string,
  body: string,
  expectedGeneration: number,
): void {
  if (typeof window === "undefined" || generation !== expectedGeneration || owner !== accountId)
    return;
  const key = `${accountId}:${bingoId}`;
  drafts.delete(key);
  if (!body.trim()) return;
  for (const [entryKey, entry] of drafts) {
    if (Date.now() - entry.savedAt >= retentionMs) drafts.delete(entryKey);
  }
  drafts.set(key, { body, savedAt: Date.now() });
  while (drafts.size > maxDrafts) drafts.delete(drafts.keys().next().value!);
}
