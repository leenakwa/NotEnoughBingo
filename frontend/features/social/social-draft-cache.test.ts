import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSocialDrafts,
  readCommentDraft,
  readReportDraft,
  readInlineCommentDraft,
  rememberCommentDraft,
  rememberReportDraft,
  rememberInlineCommentDraft,
} from "@/features/social/social-draft-cache";
import {
  AUTH_SESSION_ENDED_EVENT,
  AUTH_SYNC_KEY,
  notifyAuthChanged,
  notifySignedOut,
} from "@/lib/auth-events";

function save(owner: string, board: string, body: string) {
  const { generation } = readCommentDraft(owner, board);
  rememberCommentDraft(owner, board, body, generation);
  return generation;
}

describe("comment draft privacy and lifetime", () => {
  beforeEach(() => clearSocialDrafts());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps exact text per board, clears blanks and does not put text in storage", () => {
    const body = "Private comment 🎲\n<literal> & context";
    const generation = save("owner", "first", body);
    save("owner", "second", "Other board");
    expect(readCommentDraft("owner", "first").body).toBe(body);
    expect(readCommentDraft("owner", "second").body).toBe("Other board");
    expect(JSON.stringify(window.localStorage)).not.toContain(body);
    rememberCommentDraft("owner", "first", "  ", generation);
    expect(readCommentDraft("owner", "first").body).toBe("");
  });

  it("purges the old account and rejects delayed writes from its component", () => {
    const previous = save("first-account", "board", "Previous account text");
    expect(readCommentDraft("second-account", "board").body).toBe("");
    rememberCommentDraft("first-account", "board", "Late old response", previous);
    expect(readCommentDraft("first-account", "board").body).toBe("");
  });

  it("expires drafts after 24 hours and bounds retained boards to 64", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T00:00:00Z"));
    save("owner", "expired", "Expired text");
    vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
    expect(readCommentDraft("owner", "expired").body).toBe("");
    for (let i = 0; i < 65; i += 1) save("owner", String(i), `Draft ${i}`);
    expect(readCommentDraft("owner", "0").body).toBe("");
    expect(readCommentDraft("owner", "64").body).toBe("Draft 64");
  });

  it("preserves drafts during auth refresh or expiry but clears explicit sign-out", () => {
    const generation = save("owner", "board", "Keep during reauthentication");
    notifyAuthChanged();
    window.dispatchEvent(new Event(AUTH_SESSION_ENDED_EVENT));
    expect(readCommentDraft("owner", "board").body).toBe("Keep during reauthentication");
    notifySignedOut();
    expect(window.localStorage.getItem(AUTH_SYNC_KEY)).toMatch(/^signed-out:/);
    expect(readCommentDraft("owner", "board").body).toBe("");
    rememberCommentDraft("owner", "board", "Late write after logout", generation);
    expect(readCommentDraft("owner", "board").body).toBe("");
  });

  it("clears on another tab's explicit sign-out", () => {
    const generation = save("owner", "board", "Other tab private draft");
    window.dispatchEvent(
      new StorageEvent("storage", { key: AUTH_SYNC_KEY, newValue: "signed-out:synthetic-change" }),
    );
    expect(readCommentDraft("owner", "board").body).toBe("");
    rememberCommentDraft("owner", "board", "Late old write", generation);
    expect(readCommentDraft("owner", "board").body).toBe("");
  });

  it("clears local drafts even when cross-tab storage is unavailable", () => {
    save("owner", "board", "Private text");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    notifySignedOut();
    expect(readCommentDraft("owner", "board").body).toBe("");
  });

  it("keeps report reason and text isolated from other targets and comments", () => {
    const saved = readReportDraft("owner", "bingo", "board");
    rememberReportDraft(
      "owner",
      "bingo",
      "board",
      { reason: "other", description: "Private context 🎲\n<literal> & detail" },
      saved.generation,
    );
    save("owner", "board", "Separate comment");
    expect(readReportDraft("owner", "bingo", "board")).toMatchObject({
      reason: "other",
      description: "Private context 🎲\n<literal> & detail",
      restored: true,
    });
    expect(readReportDraft("owner", "comment", "board").restored).toBe(false);
    expect(readReportDraft("owner", "bingo", "another").restored).toBe(false);
    expect(readCommentDraft("owner", "board").body).toBe("Separate comment");
    expect(JSON.stringify(window.localStorage)).not.toContain("Private context");
  });

  it("retains reason-only reports and clears successful or discarded reports", () => {
    const saved = readReportDraft("owner", "profile", "profile");
    rememberReportDraft(
      "owner",
      "profile",
      "profile",
      { reason: "harassment", description: "" },
      saved.generation,
    );
    expect(readReportDraft("owner", "profile", "profile")).toMatchObject({
      reason: "harassment",
      restored: true,
    });
    rememberReportDraft("owner", "profile", "profile", null, saved.generation);
    expect(readReportDraft("owner", "profile", "profile").restored).toBe(false);
  });

  it("purges reports on sign-out and rejects their late writes", () => {
    const saved = readReportDraft("owner", "bingo", "board");
    const draft = { reason: "other" as const, description: "Confidential report" };
    rememberReportDraft("owner", "bingo", "board", draft, saved.generation);
    notifySignedOut();
    rememberReportDraft("owner", "bingo", "board", draft, saved.generation);
    expect(readReportDraft("owner", "bingo", "board").restored).toBe(false);
  });

  it("preserves inline targets and empty dirty edits independently from replies", () => {
    const saved = readInlineCommentDraft("owner", "board", "reply");
    rememberInlineCommentDraft(
      "owner",
      "board",
      "reply",
      { kind: "reply", targetId: "parent", body: "Reply 🎲\n<literal>", page: 3 },
      saved.generation,
    );
    rememberInlineCommentDraft(
      "owner",
      "board",
      "edit",
      { kind: "edit", targetId: "child", body: "", originalBody: "Existing text", page: 3 },
      saved.generation,
    );
    expect(readInlineCommentDraft("owner", "board", "reply").draft).toMatchObject({
      targetId: "parent",
      body: "Reply 🎲\n<literal>",
      page: 3,
    });
    expect(readInlineCommentDraft("owner", "board", "edit").draft).toMatchObject({
      targetId: "child",
      body: "",
      originalBody: "Existing text",
    });
    expect(readInlineCommentDraft("owner", "another-board", "reply").draft).toBeUndefined();
    expect(readCommentDraft("owner", "board").body).toBe("");
    rememberInlineCommentDraft("owner", "board", "reply", null, saved.generation);
    expect(readInlineCommentDraft("owner", "board", "reply").draft).toBeUndefined();
    expect(readInlineCommentDraft("owner", "board", "edit").draft).toBeDefined();
  });

  it("clears both inline drafts on owner change and rejects late writes", () => {
    const saved = readInlineCommentDraft("owner", "board", "reply");
    const draft = {
      kind: "reply" as const,
      targetId: "parent",
      body: "Old private reply",
      page: 1,
    };
    rememberInlineCommentDraft("owner", "board", "reply", draft, saved.generation);
    readReportDraft("another-owner", "profile", "profile");
    rememberInlineCommentDraft("owner", "board", "reply", draft, saved.generation);
    expect(readInlineCommentDraft("owner", "board", "reply").draft).toBeUndefined();
  });
});
