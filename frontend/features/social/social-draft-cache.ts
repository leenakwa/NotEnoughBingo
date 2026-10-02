"use client";

import { AUTH_SIGNED_OUT_EVENT, AUTH_SYNC_KEY } from "@/lib/auth-events";

import type { ReportReason, ReportTargetType } from "@/lib/api/types";

type SocialDraft =
  { kind: "comment"; body: string } | { kind: "report"; reason: ReportReason; description: string };

const maxDrafts = 64;
const retentionMs = 24 * 60 * 60 * 1_000;
const drafts = new Map<string, { draft: SocialDraft; savedAt: number }>();
let owner: string | undefined;
let generation = 0;
let listening = false;
let signOutChannel: BroadcastChannel | undefined;

export function clearSocialDrafts(): void {
  drafts.clear();
  owner = undefined;
  generation += 1;
}

function listenForSignOut(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(AUTH_SIGNED_OUT_EVENT, clearSocialDrafts);
  try {
    if (typeof window.BroadcastChannel !== "undefined") {
      signOutChannel = new window.BroadcastChannel(AUTH_SYNC_KEY);
      signOutChannel.addEventListener("message", (event) => {
        if (event.data === "signed-out") clearSocialDrafts();
      });
    }
  } catch {
    // Fall back to the existing storage signal.
  }
  window.addEventListener("storage", (event) => {
    if (event.key === AUTH_SYNC_KEY && event.newValue?.startsWith("signed-out:")) {
      clearSocialDrafts();
    }
  });
}

function readDraft(accountId: string, key: string): { draft?: SocialDraft; generation: number } {
  if (typeof window === "undefined") return { generation };
  listenForSignOut();
  if (owner && owner !== accountId) clearSocialDrafts();
  owner = accountId;
  const saved = drafts.get(key);
  if (saved && Date.now() - saved.savedAt >= retentionMs) drafts.delete(key);
  return { draft: drafts.get(key)?.draft, generation };
}

function rememberDraft(
  accountId: string,
  key: string,
  draft: SocialDraft | null,
  expectedGeneration: number,
): void {
  if (typeof window === "undefined" || generation !== expectedGeneration || owner !== accountId)
    return;
  drafts.delete(key);
  if (!draft) return;
  for (const [entryKey, entry] of drafts) {
    if (Date.now() - entry.savedAt >= retentionMs) drafts.delete(entryKey);
  }
  drafts.set(key, { draft, savedAt: Date.now() });
  while (drafts.size > maxDrafts) drafts.delete(drafts.keys().next().value!);
}

export function readCommentDraft(accountId: string, bingoId: string) {
  const saved = readDraft(accountId, `comment:${accountId}:${bingoId}`);
  return {
    body: saved.draft?.kind === "comment" ? saved.draft.body : "",
    generation: saved.generation,
  };
}

export function rememberCommentDraft(
  accountId: string,
  bingoId: string,
  body: string,
  expectedGeneration: number,
): void {
  rememberDraft(
    accountId,
    `comment:${accountId}:${bingoId}`,
    body.trim() ? { kind: "comment", body } : null,
    expectedGeneration,
  );
}

export function readReportDraft(accountId: string, targetType: ReportTargetType, targetId: string) {
  const saved = readDraft(accountId, `report:${accountId}:${targetType}:${targetId}`);
  return {
    reason: saved.draft?.kind === "report" ? saved.draft.reason : ("spam" as ReportReason),
    description: saved.draft?.kind === "report" ? saved.draft.description : "",
    restored: saved.draft?.kind === "report",
    generation: saved.generation,
  };
}

export function rememberReportDraft(
  accountId: string,
  targetType: ReportTargetType,
  targetId: string,
  draft: { reason: ReportReason; description: string } | null,
  expectedGeneration: number,
): void {
  rememberDraft(
    accountId,
    `report:${accountId}:${targetType}:${targetId}`,
    draft && (draft.reason !== "spam" || draft.description.trim())
      ? { kind: "report", ...draft }
      : null,
    expectedGeneration,
  );
}
