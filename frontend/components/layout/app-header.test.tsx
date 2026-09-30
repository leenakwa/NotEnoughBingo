import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/components/layout/app-header";
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

describe("AppHeader session expiry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/bingo/test");
    mocks.session.mockResolvedValue(user);
    mocks.unreadCount.mockResolvedValue({ count: 0 });
  });

  it("checks the session once for simultaneous authentication failures", async () => {
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
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/login?reason=session-expired&next=%2Fbingo%2Ftest",
      ),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event("neb:auth-required")));
    expect(mocks.session).toHaveBeenCalledTimes(2);
  });
});
