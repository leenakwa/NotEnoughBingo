import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BingoCard } from "@/components/bingo/bingo-card";
import { AUTH_SIGNED_OUT_EVENT } from "@/lib/auth-events";
import type { BingoSummary, PreviewMedia, RevisionCell } from "@/lib/api/types";

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
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
  isAuthenticationRequiredError: (error: unknown) =>
    Boolean(error && typeof error === "object" && "status" in error && error.status === 403),
}));

const previewCells: RevisionCell[] = Array.from({ length: 9 }, (_, index) => ({
  id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
  row: Math.floor(index / 3),
  column: index % 3,
  text: index === 0 ? "First cell" : `Cell ${index + 1}`,
  text_color: "#000000",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  background_color: "#ffffff",
  background_opacity: 1,
  image: null,
  image_alt: "",
  image_opacity: 1,
  border_color: "#000000",
  border_width: 1,
  border_style: "solid",
}));

const bingo: BingoSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Production readiness",
  description: "",
  language: "en",
  author: {
    id: "22222222-2222-4222-8222-222222222222",
    username: "author",
    display_name: "Author",
    avatar: null,
  },
  cover: null,
  preview: {
    size: 3,
    board_background: null,
    cells: previewCells,
  },
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

const image: PreviewMedia = {
  id: "44444444-4444-4444-8444-444444444444",
  width: 24,
  height: 16,
  url: "/api/v1/media/full/",
  thumbnail_url: "/api/v1/media/thumbnail/",
};

describe("BingoCard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.unlike.mockResolvedValue(undefined);
  });

  it("handles the unlike endpoint's empty 204 response", async () => {
    const user = userEvent.setup();
    render(<BingoCard bingo={bingo} />);

    await user.click(screen.getByRole("button", { name: `Unlike ${bingo.title}` }));

    expect(mocks.unlike).toHaveBeenCalledWith(bingo.id);
    expect(screen.getByRole("button", { name: `Like ${bingo.title}` })).toHaveTextContent("3");
  });

  it("renders the bingo board and keeps social actions at the bottom", () => {
    render(<BingoCard bingo={bingo} />);

    const preview = screen.getByRole("img", {
      name: `Preview of ${bingo.title}, 3 by 3 bingo`,
    });
    const card = screen.getByRole("article");

    expect(preview.querySelectorAll(".bingo-card-preview__cell")).toHaveLength(9);
    expect(preview).toHaveTextContent("First cell");
    expect(preview.style.getPropertyValue("--preview-font-size")).toBe("3.1579cqw");
    expect(card.lastElementChild).toHaveClass("bingo-card__actions");
    expect(card.lastElementChild?.previousElementSibling).toHaveClass("bingo-card__tags");
  });

  it("identifies the language of creator-written titles", () => {
    render(<BingoCard bingo={{ ...bingo, title: "Русское бинго", language: "ru" }} />);

    expect(screen.getByRole("heading", { name: "Русское бинго" })).toHaveAttribute("lang", "ru");
  });

  it("loads small preview images lazily and hides decorative images from screen readers", () => {
    render(
      <BingoCard
        bingo={{
          ...bingo,
          preview: {
            size: 3,
            board_background: image,
            cells: [{ ...previewCells[0]!, image }, ...previewCells.slice(1)],
          },
        }}
      />,
    );
    const images = screen
      .getByRole("img", { name: /Preview of Production readiness/ })
      .querySelectorAll("img");
    expect(images).toHaveLength(2);
    for (const item of images) {
      expect(item).toHaveAttribute("src", image.thumbnail_url);
      expect(item).toHaveAttribute("loading", "lazy");
      expect(item).toHaveAttribute("alt", "");
    }
    fireEvent.error(images[0]!);
    expect(
      screen.getByRole("img", { name: /Preview of Production readiness/ }).querySelectorAll("img"),
    ).toHaveLength(1);
  });

  it("preserves image-only cell titles and styles with slim media and no thumbnail", () => {
    const imageAlt = "Full image description ".repeat(6);
    const cell = {
      ...previewCells[0]!,
      text: "",
      image_alt: imageAlt,
      image: { ...image, thumbnail_url: null },
      bold: true,
      italic: true,
      underline: true,
      background_opacity: 0.5,
      image_opacity: 0.7,
      border_color: "#112233",
      border_width: 2,
    };
    render(
      <BingoCard
        bingo={{
          ...bingo,
          preview: {
            size: 3,
            board_background: { ...image, thumbnail_url: null },
            cells: [cell, ...previewCells.slice(1)],
          },
        }}
      />,
    );
    const preview = screen.getByRole("img", { name: /Preview of Production readiness/ });
    const firstCell = preview.querySelector(".bingo-card-preview__cell")!;
    expect(firstCell).toHaveAttribute("title", imageAlt);
    expect(firstCell).toHaveStyle({ borderColor: "#112233", borderWidth: "2px" });
    expect(firstCell.querySelector(".bingo-card-preview__background")).toHaveStyle({
      opacity: 0.5,
    });
    expect(firstCell.querySelector(".bingo-card-preview__image")).toHaveStyle({ opacity: 0.7 });
    expect(firstCell.querySelector(".bingo-card-preview__text")).toHaveStyle({
      fontWeight: 700,
      fontStyle: "italic",
      textDecoration: "underline",
    });
    for (const item of preview.querySelectorAll("img")) {
      expect(item).toHaveAttribute("src", image.url);
    }
    expect(preview.querySelectorAll(".bingo-card-preview__cell")).toHaveLength(9);
  });

  it("opens an unpublished creator card directly in the editor", () => {
    render(<BingoCard bingo={{ ...bingo, status: "draft", title: "" }} />);

    expect(screen.getByRole("heading", { name: "Untitled bingo" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Untitled bingo/ })).toHaveAttribute(
      "href",
      `/create?bingo=${bingo.id}`,
    );
  });

  it("redirects guests to login without rendering an API error", async () => {
    const user = userEvent.setup();
    mocks.unlike.mockRejectedValueOnce({
      status: 403,
      message: "Authentication credentials were not provided.",
    });
    render(<BingoCard bingo={bingo} />);

    await user.click(screen.getByRole("button", { name: `Unlike ${bingo.title}` }));

    expect(mocks.push).toHaveBeenCalledWith(
      `/login?next=${encodeURIComponent(`/bingo/${bingo.id}`)}`,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not redirect a departed page when its pending like rejects authentication", async () => {
    let rejectUnlike!: (error: { status: number }) => void;
    mocks.unlike.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectUnlike = reject;
      }),
    );
    const view = render(<BingoCard bingo={bingo} />);
    fireEvent.click(screen.getByRole("button", { name: `Unlike ${bingo.title}` }));
    view.unmount();
    await act(async () => rejectUnlike({ status: 403 }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not apply a previous account's unlike response after logout", async () => {
    let resolveUnlike!: () => void;
    mocks.unlike.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveUnlike = resolve;
      }),
    );
    const view = render(<BingoCard bingo={bingo} />);
    fireEvent.click(screen.getByRole("button", { name: `Unlike ${bingo.title}` }));
    act(() => window.dispatchEvent(new Event(AUTH_SIGNED_OUT_EVENT)));
    view.rerender(<BingoCard bingo={{ ...bingo, liked_by_me: false }} />);
    await act(async () => resolveUnlike());
    expect(screen.getByRole("button", { name: `Like ${bingo.title}` })).toHaveTextContent("4");
  });

  it("starts only one write for simultaneous like clicks", async () => {
    mocks.unlike.mockReturnValueOnce(new Promise(() => undefined));
    render(<BingoCard bingo={bingo} />);
    const button = screen.getByRole("button", { name: `Unlike ${bingo.title}` });
    act(() => {
      button.click();
      button.click();
    });
    expect(mocks.unlike).toHaveBeenCalledTimes(1);
  });
});
