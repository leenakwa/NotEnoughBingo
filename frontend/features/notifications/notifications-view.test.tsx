import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { NotificationsView } from "@/features/notifications/notifications-view";
import { AUTH_SIGNED_IN_EVENT, AUTH_SIGNED_OUT_EVENT } from "@/lib/auth-events";
import type { Notification, Page } from "@/lib/api/types";
const mocks = vi.hoisted(() => ({ list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  api: { notifications: mocks },
  errorMessage: () => "Notifications unavailable.",
  isAuthenticationRequiredError: (error: { status?: number }) => error.status === 403,
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    onClick,
  }: React.PropsWithChildren<{ href: string; onClick: () => void }>) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </a>
  ),
}));
const item: Notification = {
  id: "notification-1",
  kind: "bingo_like",
  actor: null,
  message: "First activity",
  target_url: "/bingo/board",
  read_at: null,
  created_at: "2026-10-03T00:00:00Z",
};
const collection = (notification = item, next: string | null = null): Page<Notification> => ({
  count: next ? 2 : 1,
  next,
  previous: null,
  results: [notification],
});
const nextItem = { ...item, id: "notification-2", message: "Next activity" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue(collection());
  mocks.markRead.mockResolvedValue({ ...item, read_at: "2026-10-03T01:00:00Z" });
  mocks.markAllRead.mockResolvedValue(undefined);
});
it("retries page two after a read failure without displaying the old page", async () => {
  let rejectPage!: (reason: unknown) => void;
  let resolveRetry!: (value: Page<Notification>) => void;
  mocks.list.mockResolvedValueOnce(collection(item, "/notifications?page=2"));
  mocks.list.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      rejectPage = reject;
    }),
  );
  mocks.list.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveRetry = resolve;
    }),
  );
  render(<NotificationsView />);
  await screen.findByText("First activity");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Loading notifications…")).toBeVisible();
  expect(screen.queryByText("First activity")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  expect(mocks.list).toHaveBeenCalledTimes(2);
  expect(mocks.list).toHaveBeenLastCalledWith(2, expect.any(AbortSignal));
  await act(async () => rejectPage({ status: 503 }));
  expect(screen.getByRole("alert")).toHaveTextContent("Notifications unavailable.");
  expect(screen.queryByText("First activity")).not.toBeInTheDocument();
  expect(screen.queryByText("Loading notifications…")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByText("Loading notifications…")).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText("First activity")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  expect(mocks.list).toHaveBeenCalledTimes(3);
  expect(mocks.list).toHaveBeenLastCalledWith(2, expect.any(AbortSignal));
  await act(async () =>
    resolveRetry({ ...collection(nextItem), previous: "/notifications?page=1" }),
  );
  expect(screen.getByText("Next activity")).toBeVisible();
  expect(screen.getByText("Page 2")).toBeVisible();
  expect(screen.queryByText("First activity")).not.toBeInTheDocument();
  expect(screen.queryByText("Loading notifications…")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark all as read" })).toBeEnabled();
});
it("keeps rows unread after a mark-all failure and allows one successful resubmission", async () => {
  let rejectAll!: (reason: unknown) => void;
  let resolveAll!: () => void;
  mocks.markAllRead.mockReturnValueOnce(
    new Promise<void>((_resolve, reject) => {
      rejectAll = reject;
    }),
  );
  mocks.markAllRead.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveAll = resolve;
    }),
  );
  mocks.list.mockResolvedValueOnce({ ...collection(), count: 2, results: [item, nextItem] });
  render(<NotificationsView />);
  await screen.findByText("First activity");
  const button = screen.getByRole("button", { name: "Mark all as read" });
  const rows = () =>
    ["First activity", "Next activity"].map((text) => screen.getByText(text).closest("li"));
  fireEvent.click(button);
  expect(button).toBeDisabled();
  rows().forEach((row) => expect(row).toHaveClass("is-unread"));
  expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
  await act(async () => rejectAll({ status: 503 }));
  expect(screen.getByRole("alert")).toHaveTextContent("Notifications unavailable.");
  expect(button).toBeEnabled();
  rows().forEach((row) => expect(row).toHaveClass("is-unread"));

  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  rows().forEach((row) => expect(row).toHaveClass("is-unread"));
  expect(mocks.markAllRead).toHaveBeenCalledTimes(2);
  await act(async () => resolveAll());
  rows().forEach((row) => expect(row).not.toHaveClass("is-unread"));
  expect(button).toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.markAllRead).toHaveBeenCalledTimes(2);
  expect(mocks.list).toHaveBeenCalledTimes(1);
});
it("does not apply an old mark-all response to the next page", async () => {
  let resolveAll!: () => void;
  mocks.markAllRead.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      resolveAll = resolve;
    }),
  );
  mocks.list.mockResolvedValueOnce(collection(item, "/notifications?page=2"));
  mocks.list.mockResolvedValueOnce(collection(nextItem));
  render(<NotificationsView />);
  await screen.findByText("First activity");
  fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("Next activity");
  await act(async () => resolveAll());
  expect(screen.getByText("Next activity").closest("li")).toHaveClass("is-unread");
});
it("ignores a previous account's pending read error", async () => {
  let rejectRead!: (error: Error) => void;
  mocks.markRead.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      rejectRead = reject;
    }),
  );
  mocks.list.mockResolvedValueOnce(collection());
  mocks.list.mockResolvedValueOnce(collection(nextItem));
  render(<NotificationsView />);
  fireEvent.click(await screen.findByText("First activity"));
  act(() => window.dispatchEvent(new Event(AUTH_SIGNED_IN_EVENT)));
  await screen.findByText("Next activity");
  await act(async () => rejectRead(new Error("Old request failed")));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("clears the previous account's notifications while the new account loads", async () => {
  mocks.list.mockResolvedValueOnce(collection());
  mocks.list.mockReturnValueOnce(new Promise(() => undefined));
  render(<NotificationsView />);
  await screen.findByText("First activity");
  act(() => window.dispatchEvent(new Event(AUTH_SIGNED_OUT_EVENT)));
  expect(screen.queryByText("First activity")).not.toBeInTheDocument();
  expect(screen.getByText("Loading notifications…")).toBeVisible();
  expect(screen.getByRole("button", { name: "Mark all as read" })).toBeDisabled();
});
it("prevents simultaneous duplicate mark-all submissions", async () => {
  mocks.markAllRead.mockReturnValueOnce(new Promise(() => undefined));
  render(<NotificationsView />);
  await screen.findByText("First activity");
  const button = screen.getByRole("button", { name: "Mark all as read" });
  act(() => {
    button.click();
    button.click();
  });
  expect(mocks.markAllRead).toHaveBeenCalledTimes(1);
});
it("prevents simultaneous duplicate individual read submissions", async () => {
  mocks.markRead.mockReturnValueOnce(new Promise(() => undefined));
  render(<NotificationsView />);
  const link = (await screen.findByText("First activity")).closest("a")!;
  act(() => {
    link.click();
    link.click();
  });
  expect(mocks.markRead).toHaveBeenCalledTimes(1);
});
it("shows the private-account login state when marking read requires authentication", async () => {
  mocks.markAllRead.mockRejectedValueOnce({ status: 403 });
  render(<NotificationsView />);
  await screen.findByText("First activity");
  fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
  expect(await screen.findByText("Log in to view notifications")).toBeVisible();
  expect(screen.queryByText("First activity")).not.toBeInTheDocument();
});
