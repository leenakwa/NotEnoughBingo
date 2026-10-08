import { BroadcastChannel as NativeBroadcastChannel } from "node:worker_threads";
import { expect, it, vi } from "vitest";

import {
  clearSocialDrafts,
  readCommentDraft,
  rememberCommentDraft,
} from "@/features/social/social-draft-cache";
import { AUTH_SYNC_KEY, notifySignedOut } from "@/lib/auth-events";

it("clears drafts for foreign channel logout while ignoring delayed delivery of its own logout", async () => {
  const channels: NativeBroadcastChannel[] = [];
  class TrackedBroadcastChannel extends NativeBroadcastChannel {
    constructor(name: string) {
      super(name);
      channels.push(this);
    }
  }
  vi.stubGlobal("BroadcastChannel", TrackedBroadcastChannel);
  const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  const save = (body: string) => {
    const { generation } = readCommentDraft("owner", "board");
    rememberCommentDraft("owner", "board", body, generation);
    return generation;
  };
  try {
    clearSocialDrafts();
    const oldGeneration = save("Before logout");
    const witness = new TrackedBroadcastChannel(AUTH_SYNC_KEY);
    const nextDelivery = () =>
      new Promise<void>((resolve) =>
        witness.addEventListener("message", () => resolve(), { once: true }),
      );
    const ownDelivery = nextDelivery();
    notifySignedOut();
    expect(readCommentDraft("owner", "board").body).toBe("");
    rememberCommentDraft("owner", "board", "Late old write", oldGeneration);
    expect(readCommentDraft("owner", "board").body).toBe("");
    save("New session draft");
    await ownDelivery;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readCommentDraft("owner", "board").body).toBe("New session draft");

    const sender = new TrackedBroadcastChannel(AUTH_SYNC_KEY);
    const generation = save("Foreign logout must clear this");
    const delivered = nextDelivery();
    sender.postMessage("signed-out");
    await delivered;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(readCommentDraft("owner", "board").body).toBe("");
    rememberCommentDraft("owner", "board", "Late foreign write", generation);
    expect(readCommentDraft("owner", "board").body).toBe("");
  } finally {
    channels.forEach((channel) => channel.close());
    clearSocialDrafts();
    storage.mockRestore();
    vi.unstubAllGlobals();
  }
});
