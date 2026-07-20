import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BingoCard } from "@/components/bingo/bingo-card";
import type { BingoSummary } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  unlike: vi.fn(),
  like: vi.fn(),
  push: vi.fn(),
  track: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/analytics", () => ({
  trackInteraction: mocks.track,
}));

vi.mock("@/lib/api/client", () => ({
  api: {
    bingos: {
      like: mocks.like,
      unlike: mocks.unlike,
    },
  },
  ApiClientError: class extends Error {},
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
}));

const bingo: BingoSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Production readiness",
  description: "",
  author: {
    id: "22222222-2222-4222-8222-222222222222",
    username: "author",
    display_name: "Author",
    avatar: null,
  },
  cover: null,
  tags: [],
  size: 5,
  status: "published",
  visibility: "public",
  completion_style: "checkmark",
  stats: {
    likes: 4,
    comments: 0,
    plays: 0,
    shares: 0,
    views: 0,
  },
  liked_by_me: true,
  published_at: "2026-07-20T00:00:00Z",
  updated_at: "2026-07-20T00:00:00Z",
};

describe("BingoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unlike.mockResolvedValue(undefined);
  });

  it("handles the unlike endpoint's empty 204 response", async () => {
    const user = userEvent.setup();
    render(<BingoCard bingo={bingo} />);

    await user.click(screen.getByRole("button", { name: `Unlike ${bingo.title}` }));

    expect(mocks.unlike).toHaveBeenCalledWith(bingo.id);
    expect(screen.getByRole("button", { name: `Like ${bingo.title}` })).toHaveTextContent("3");
  });
});
