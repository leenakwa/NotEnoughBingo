import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ProfileCollections } from "@/features/profile/profile-collections";
import type { BingoSummary } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({ bingos: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  api: { profiles: { bingos: mocks.bingos } },
  errorMessage: () => "Collection unavailable.",
}));
vi.mock("@/components/bingo/bingo-grid", () => ({
  BingoGrid: ({ bingos }: { bingos: BingoSummary[] }) => (
    <div>
      {bingos.map((bingo) => (
        <p key={bingo.id}>{bingo.title}</p>
      ))}
    </div>
  ),
}));

it("keeps the loaded collection when its already selected tab is clicked again", async () => {
  mocks.bingos.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [{ id: "board", title: "My published bingo" }],
  });
  render(<ProfileCollections username="author" ownProfile />);
  await screen.findByText("My published bingo");
  fireEvent.click(screen.getByRole("tab", { name: "Created" }));
  expect(screen.getByText("My published bingo")).toBeVisible();
  expect(mocks.bingos).toHaveBeenCalledTimes(1);
});
