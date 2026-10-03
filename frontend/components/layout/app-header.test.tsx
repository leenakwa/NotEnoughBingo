import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/layout/app-header";
import { AUTH_CHANGED_EVENT, AUTH_DIALOG_EVENT, AUTH_SIGNED_OUT_EVENT } from "@/lib/auth-events";
import type { AuthenticatedUser } from "@/lib/api/types";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  session: vi.fn(),
  unreadCount: vi.fn(),
}));

vi.mock("next/navigation", () => {
  const router = { replace: mocks.replace, refresh: mocks.refresh };
  return {
    usePathname: () => "/bingo/test",
    useRouter: () => router,
  };
});

vi.mock("@/lib/api/client", () => ({
  api: {
    auth: { session: mocks.session },
    notifications: { unreadCount: mocks.unreadCount },
  },
  isAuthenticationRequiredError: () => false,
}));

const user: AuthenticatedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "player",
  display_name: "Test Player",
  avatar: null,
  email: "player@example.test",
  email_verified: true,
  deletion_scheduled_for: null,
};

describe("AppHeader scroll shadow", () => {
  const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, "scrollY")!;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue(null);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  afterEach(() => {
    Object.defineProperty(window, "scrollY", scrollYDescriptor);
  });

  it.each(["classic", "modern"] as const)(
    "shows the %s shadow after the first pixel and removes it at the top",
    async (variant) => {
      await act(async () => render(<AppHeader variant={variant} />));
      const header = screen.getByRole("banner");
      expect(header).not.toHaveClass("is-scrolled");

      for (const position of [1, 250, 0]) {
        act(() => {
          Object.defineProperty(window, "scrollY", { configurable: true, value: position });
          window.dispatchEvent(new Event("scroll"));
        });
        if (position > 0) expect(header).toHaveClass("is-scrolled");
        else expect(header).not.toHaveClass("is-scrolled");
      }
    },
  );

  it("reads an already restored scroll position when mounted", async () => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    await act(async () => render(<AppHeader />));
    expect(screen.getByRole("banner")).toHaveClass("is-scrolled");
  });

  it.each([
    ["desktop WebKit", "Macintosh AppleWebKit/605.1.15", 0, true],
    ["desktop Chrome", "Macintosh AppleWebKit/537.36 Chrome/140.0", 0, false],
    ["mobile WebKit", "iPhone AppleWebKit/605.1.15 Mobile", 5, false],
    ["iPad desktop mode", "Macintosh AppleWebKit/605.1.15", 5, false],
  ] as const)(
    "handles elastic scroll in %s without changing other browsers",
    async (_, ua, touch, correct) => {
      const userAgent = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
      const touchDescriptor = Object.getOwnPropertyDescriptor(navigator, "maxTouchPoints");
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: touch });
      try {
        let unmount!: () => void;
        await act(async () => {
          ({ unmount } = render(<AppHeader />));
        });
        const header = screen.getByRole("banner");
        for (const position of [-20, -80, -5, 0, 1]) {
          act(() => {
            Object.defineProperty(window, "scrollY", { configurable: true, value: position });
            window.dispatchEvent(new Event("scroll"));
          });
          expect(header.style.getPropertyValue("--header-overscroll-top")).toBe(
            correct && position < 0 ? `${position}px` : "",
          );
          if (position > 0) expect(header).toHaveClass("is-scrolled");
          else expect(header).not.toHaveClass("is-scrolled");
        }
        act(() => {
          Object.defineProperty(window, "scrollY", { configurable: true, value: -30 });
          window.dispatchEvent(new Event("scroll"));
        });
        unmount();
        expect(header.style.getPropertyValue("--header-overscroll-top")).toBe("");
      } finally {
        userAgent.mockRestore();
        if (touchDescriptor) Object.defineProperty(navigator, "maxTouchPoints", touchDescriptor);
        else Reflect.deleteProperty(navigator, "maxTouchPoints");
      }
    },
  );
});

describe("AppHeader session expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/bingo/test");
    mocks.session.mockResolvedValue(user);
    mocks.unreadCount.mockResolvedValue({ count: 0 });
  });

  it("keeps navigation and account access usable if unread counts are unavailable", async () => {
    mocks.unreadCount.mockRejectedValueOnce(new Error("Optional count unavailable"));
    render(<AppHeader />);
    expect(await screen.findByRole("link", { name: "Profile for Test Player" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute(
      "href",
      "/notifications",
    );
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/explore");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not apply a late unread count from the previous account", async () => {
    let resolveOld: (value: { count: number }) => void = () => undefined;
    mocks.unreadCount.mockReturnValueOnce(
      new Promise((done) => {
        resolveOld = done;
      }),
    );
    render(<AppHeader />);
    await screen.findByRole("link", { name: "Profile for Test Player" });
    mocks.session.mockResolvedValueOnce({
      ...user,
      id: "other-user-id",
      display_name: "Other Player",
    });
    act(() => window.dispatchEvent(new Event(AUTH_CHANGED_EVENT)));
    await screen.findByRole("link", { name: "Profile for Other Player" });
    await act(async () => resolveOld({ count: 19 }));
    expect(screen.getByRole("link", { name: "Notifications" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "Notifications, 19 unread" }),
    ).not.toBeInTheDocument();
  });

  it("checks the session once for simultaneous authentication failures", async () => {
    const openDialog = vi.fn();
    window.addEventListener(AUTH_DIALOG_EVENT, openDialog);
    render(<AppHeader />);
    await screen.findByRole("link", { name: "Profile for Test Player" });
    expect(mocks.session).toHaveBeenCalledOnce();

    let finishCheck: (next: AuthenticatedUser | null) => void = () => undefined;
    const pendingCheck = new Promise<AuthenticatedUser | null>((resolve) => {
      finishCheck = resolve;
    });
    mocks.session.mockReturnValueOnce(pendingCheck);

    act(() => {
      window.dispatchEvent(new Event("neb:auth-required"));
      window.dispatchEvent(new Event("neb:auth-required"));
      window.dispatchEvent(new Event("neb:auth-required"));
    });
    expect(mocks.session).toHaveBeenCalledTimes(2);

    await act(async () => {
      finishCheck(null);
      await pendingCheck;
    });
    await waitFor(() => expect(openDialog).toHaveBeenCalledOnce());
    expect(openDialog.mock.calls[0]?.[0]).toMatchObject({
      detail: { mode: "login", reason: "session-expired" },
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event("neb:auth-required")));
    expect(mocks.session).toHaveBeenCalledTimes(2);
    window.removeEventListener(AUTH_DIALOG_EVENT, openDialog);
  });

  it("clears old account scope when focus detects an explicit logout event", async () => {
    let logoutEvent: string | null = null;
    mocks.session.mockImplementation(async (observe?: (event: string | null) => void) => {
      observe?.(logoutEvent);
      return user;
    });
    mocks.unreadCount.mockResolvedValue({ count: 0 });
    const ended = vi.fn();
    window.addEventListener(AUTH_SIGNED_OUT_EVENT, ended);
    try {
      await act(async () => render(<AppHeader />));
      expect(ended).not.toHaveBeenCalled();
      logoutEvent = "new-logout-event";
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(ended).toHaveBeenCalledOnce();
      expect(mocks.replace).not.toHaveBeenCalled();
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(ended).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(AUTH_SIGNED_OUT_EVENT, ended);
    }
  });

  it("does not turn ordinary session expiry into explicit sign-out", async () => {
    let current: AuthenticatedUser | null = user;
    mocks.session.mockImplementation(async (observe?: (event: string | null) => void) => {
      observe?.(null);
      return current;
    });
    mocks.unreadCount.mockResolvedValue({ count: 0 });
    const ended = vi.fn();
    window.addEventListener(AUTH_SIGNED_OUT_EVENT, ended);
    try {
      await act(async () => render(<AppHeader />));
      current = null;
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      expect(ended).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(AUTH_SIGNED_OUT_EVENT, ended);
    }
  });

  it("does not purge drafts from an obsolete session lookup", async () => {
    let call = 0;
    let release!: () => void;
    mocks.session.mockImplementation(async (observe?: (event: string | null) => void) => {
      call += 1;
      if (call === 2) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        observe?.("obsolete-logout-event");
      } else observe?.(null);
      return user;
    });
    mocks.unreadCount.mockResolvedValue({ count: 0 });
    const ended = vi.fn();
    window.addEventListener(AUTH_SIGNED_OUT_EVENT, ended);
    try {
      await act(async () => render(<AppHeader />));
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
      });
      await act(async () => release());
      expect(ended).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(AUTH_SIGNED_OUT_EVENT, ended);
    }
  });
});
