import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyEmail } from "@/components/auth/verify-email";
import { ApiClientError } from "@/lib/api/client";

const mocks = vi.hoisted(() => ({
  search: "token=single-use-token",
  verifyEmail: vi.fn(),
  confirmEmailChange: vi.fn(),
  resendVerification: vi.fn(),
  notifyAuthChanged: vi.fn(),
  markRegistrationVerified: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  api: {
    auth: {
      verifyEmail: mocks.verifyEmail,
      confirmEmailChange: mocks.confirmEmailChange,
      resendVerification: mocks.resendVerification,
    },
  },
}));

vi.mock("@/lib/auth-events", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-events")>()),
  notifyAuthChanged: mocks.notifyAuthChanged,
}));

vi.mock("@/lib/registration-onboarding", () => ({
  markRegistrationVerified: mocks.markRegistrationVerified,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const modes = ["registration", "email-change"] as const;
function confirmationApi(mode: (typeof modes)[number]) {
  return mode === "registration" ? mocks.verifyEmail : mocks.confirmEmailChange;
}

function successHeading(mode: (typeof modes)[number]) {
  return mode === "registration" ? "Email verified" : "Email changed";
}

function successResult(mode: (typeof modes)[number]) {
  return mode === "registration" ? { id: "verified-user" } : undefined;
}

describe("VerifyEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    mocks.search = "token=single-use-token";
    window.history.replaceState(null, "", `/verify-email?${mocks.search}`);
  });

  it.each(modes)("submits a single-use %s token once in StrictMode", async (mode) => {
    const confirm = confirmationApi(mode);
    confirm
      .mockResolvedValueOnce(successResult(mode))
      .mockRejectedValueOnce(new Error("Token already used"));

    const view = render(
      <StrictMode>
        <VerifyEmail mode={mode} />
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: successHeading(mode) })).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith("single-use-token");
    expect(window.location.search).toBe("");
    mocks.search = "";
    view.rerender(
      <StrictMode>
        <VerifyEmail mode={mode} />
      </StrictMode>,
    );
    expect(screen.getByRole("heading", { name: successHeading(mode) })).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(1);
    if (mode === "registration") {
      expect(mocks.markRegistrationVerified).toHaveBeenCalledExactlyOnceWith("verified-user");
      expect(mocks.notifyAuthChanged).not.toHaveBeenCalled();
    } else {
      expect(mocks.notifyAuthChanged).toHaveBeenCalledTimes(1);
      expect(mocks.markRegistrationVerified).not.toHaveBeenCalled();
    }
  });

  it.each(modes)(
    "explicitly retries a failed %s token once while held, then succeeds",
    async (mode) => {
      const held = deferred<ReturnType<typeof successResult>>();
      const confirm = confirmationApi(mode);
      confirm
        .mockRejectedValueOnce(
          new ApiClientError(503, {
            code: "service_unavailable",
            message: "The service is temporarily unavailable.",
          }),
        )
        .mockReturnValueOnce(held.promise);
      const pending = vi.fn();

      render(
        <StrictMode>
          <VerifyEmail mode={mode} onPendingChange={pending} />
        </StrictMode>,
      );

      expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable");
      const retry = screen.getByRole("button", { name: "Retry" });
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(window.location.search).toContain("token=single-use-token");
      pending.mockClear();
      act(() => {
        retry.click();
        retry.click();
      });

      expect(confirm).toHaveBeenCalledTimes(2);
      expect(confirm).toHaveBeenNthCalledWith(2, "single-use-token");
      expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
      expect(screen.getByRole("status")).toHaveTextContent("Verifying…");
      expect(pending).toHaveBeenCalledExactlyOnceWith(true);

      await act(async () => held.resolve(successResult(mode)));

      expect(screen.getByRole("heading", { name: successHeading(mode) })).toBeVisible();
      expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(pending.mock.calls).toEqual([[true], [false]]);
      expect(window.location.search).toBe("");
      expect(
        mode === "registration" ? mocks.markRegistrationVerified : mocks.notifyAuthChanged,
      ).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    new TypeError("Failed to fetch"),
    new ApiClientError(0, { code: "request_timeout", message: "The request timed out." }),
    new ApiClientError(408, { code: "http_408", message: "The request timed out." }),
    new ApiClientError(429, { code: "http_429", message: "Wait a moment and try again." }),
    new ApiClientError(200, { code: "invalid_response", message: "The response was invalid." }),
  ])("offers manual retry after a transient failure: %s", async (error) => {
    mocks.verifyEmail.mockRejectedValue(error);
    const view = render(<VerifyEmail />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeEnabled();
    expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
    view.rerender(<VerifyEmail />);
    expect(mocks.verifyEmail).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Retry" })).toBeEnabled();
    expect(mocks.verifyEmail).toHaveBeenCalledTimes(2);
  });

  it.each(modes)("gives actionable recovery for an invalid or used %s link", async (mode) => {
    confirmationApi(mode).mockRejectedValue(
      new ApiClientError(400, {
        code: "validation_error",
        message: "The verification link is invalid or has already been used.",
      }),
    );

    render(<VerifyEmail mode={mode} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid or has already been used");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    if (mode === "registration") {
      expect(screen.getByRole("link", { name: "log in" })).toHaveAttribute("href", "/login");
      expect(screen.getByRole("link", { name: "register again" })).toHaveAttribute(
        "href",
        "/register",
      );
    } else {
      expect(screen.getByText(/request a new link in Account settings/)).toBeVisible();
      expect(screen.getByRole("link", { name: "Back to profile" })).toHaveAttribute(
        "href",
        "/profile",
      );
    }
    expect(confirmationApi(mode)).toHaveBeenCalledTimes(1);
  });

  it("preserves the registration resend flow and blocks duplicate requests", async () => {
    mocks.search = "email=pending%40example.com";
    const held = deferred<void>();
    mocks.resendVerification.mockReturnValueOnce(held.promise);
    const pending = vi.fn();
    render(<VerifyEmail onPendingChange={pending} />);
    const resend = screen.getByRole("button", { name: "Resend verification email" });

    act(() => {
      resend.click();
      resend.click();
    });
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(mocks.resendVerification).toHaveBeenCalledExactlyOnceWith("pending@example.com");
    await act(async () => held.resolve());
    expect(screen.getByRole("status")).toHaveTextContent(
      "check your inbox for a verification link",
    );
    expect(screen.getByRole("button", { name: "Resend verification email" })).toBeEnabled();
    expect(pending.mock.calls).toEqual([[true], [false]]);
    expect(mocks.verifyEmail).not.toHaveBeenCalled();
  });

  it.each(["retry", "resend"])(
    "prevents concurrent retry and resend when %s starts first",
    async (first) => {
      mocks.search = "token=single-use-token&email=pending%40example.com";
      const verification = deferred<{ id: string }>();
      const resend = deferred<void>();
      mocks.verifyEmail
        .mockRejectedValueOnce(new TypeError("Offline"))
        .mockReturnValueOnce(verification.promise);
      mocks.resendVerification.mockReturnValueOnce(resend.promise);
      render(<VerifyEmail />);
      const retryButton = await screen.findByRole("button", { name: "Retry" });
      const resendButton = screen.getByRole("button", { name: "Resend verification email" });

      act(() => {
        if (first === "retry") {
          retryButton.click();
          resendButton.click();
        } else {
          resendButton.click();
          retryButton.click();
        }
      });

      if (first === "retry") {
        expect(mocks.verifyEmail).toHaveBeenCalledTimes(2);
        expect(mocks.resendVerification).not.toHaveBeenCalled();
        expect(resendButton).toBeDisabled();
        await act(async () => verification.resolve({ id: "verified-user" }));
        expect(screen.getByRole("heading", { name: "Email verified" })).toBeVisible();
      } else {
        expect(mocks.verifyEmail).toHaveBeenCalledTimes(1);
        expect(mocks.resendVerification).toHaveBeenCalledTimes(1);
        expect(retryButton).toBeDisabled();
        await act(async () => resend.resolve());
        expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("check your inbox");
      }
    },
  );

  it.each(
    modes.flatMap((mode) =>
      (["success", "failure"] as const).flatMap((outcome) =>
        (["pending", "verified"] as const).map((phase) => ({ mode, outcome, phase })),
      ),
    ),
  )(
    "ignores old resend $outcome after navigation to $mode with confirmation $phase",
    async ({ mode, outcome, phase }) => {
      mocks.search = "email=previous%40example.com";
      const old = deferred<void>();
      const confirmation = deferred<ReturnType<typeof successResult>>();
      mocks.resendVerification.mockReturnValueOnce(old.promise);
      confirmationApi(mode).mockReturnValueOnce(confirmation.promise);
      const previousPending = vi.fn();
      const currentPending = vi.fn();
      const view = render(<VerifyEmail onPendingChange={previousPending} />);
      fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
      expect(previousPending.mock.calls).toEqual([[true]]);

      mocks.search = "token=new-token&email=current%40example.com";
      const path = mode === "registration" ? "/verify-email" : "/confirm-email-change";
      window.history.pushState(null, "", `${path}?${mocks.search}`);
      view.rerender(<VerifyEmail mode={mode} onPendingChange={currentPending} />);
      expect(confirmationApi(mode)).toHaveBeenCalledExactlyOnceWith("new-token");
      expect(previousPending.mock.calls).toEqual([[true], [false]]);
      expect(currentPending.mock.calls).toEqual([[true]]);
      expect(screen.getByRole("status")).toHaveTextContent("Verifying…");

      if (phase === "verified") {
        await act(async () => confirmation.resolve(successResult(mode)));
        mocks.search = "";
        view.rerender(<VerifyEmail mode={mode} onPendingChange={currentPending} />);
        expect(screen.getByRole("heading", { name: successHeading(mode) })).toBeVisible();
        expect(window.location.search).toBe("");
      }
      const currentCalls = [...currentPending.mock.calls];

      await act(async () => {
        if (outcome === "success") old.resolve();
        else old.reject(new TypeError("The obsolete resend failed"));
      });

      expect(previousPending.mock.calls).toEqual([[true], [false]]);
      expect(currentPending.mock.calls).toEqual(currentCalls);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      if (phase === "pending") {
        expect(screen.getByRole("status")).toHaveTextContent("Verifying…");
        expect(window.location.search).toBe("?token=new-token&email=current%40example.com");
        await act(async () => confirmation.resolve(successResult(mode)));
        mocks.search = "";
        view.rerender(<VerifyEmail mode={mode} onPendingChange={currentPending} />);
      }
      expect(screen.getByRole("heading", { name: successHeading(mode) })).toBeVisible();
      expect(currentPending.mock.calls).toEqual([[true], [false]]);
      expect(window.location.search).toBe("");
      expect(
        mode === "registration" ? mocks.markRegistrationVerified : mocks.notifyAuthChanged,
      ).toHaveBeenCalledTimes(1);
    },
  );

  it("lets a new registration email resend while the previous email request is obsolete", async () => {
    const old = deferred<void>();
    const current = deferred<void>();
    mocks.resendVerification.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const previousPending = vi.fn();
    const currentPending = vi.fn();
    const view = render(
      <VerifyEmail registrationEmail="previous@example.com" onPendingChange={previousPending} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    view.rerender(
      <VerifyEmail registrationEmail="current@example.com" onPendingChange={currentPending} />,
    );
    const resend = screen.getByRole("button", { name: "Resend verification email" });
    expect(resend).toBeEnabled();
    fireEvent.click(resend);
    expect(mocks.resendVerification).toHaveBeenNthCalledWith(2, "current@example.com");

    await act(async () => old.reject(new TypeError("The obsolete resend failed")));

    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(currentPending.mock.calls).toEqual([[true]]);
    expect(previousPending.mock.calls).toEqual([[true], [false]]);
    await act(async () => current.resolve());
    expect(screen.getByRole("status")).toHaveTextContent("check your inbox");
    expect(currentPending.mock.calls).toEqual([[true], [false]]);
  });

  it.each(["success", "failure"])("ignores held resend %s after unmount", async (outcome) => {
    const held = deferred<void>();
    mocks.resendVerification.mockReturnValueOnce(held.promise);
    const pending = vi.fn();
    const view = render(
      <VerifyEmail registrationEmail="pending@example.com" onPendingChange={pending} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    view.unmount();
    expect(pending.mock.calls).toEqual([[true], [false]]);
    pending.mockClear();

    await act(async () => {
      if (outcome === "success") held.resolve();
      else held.reject(new TypeError("The obsolete resend failed"));
    });

    expect(pending).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reattaches a pending resend to the current callback without resending", async () => {
    const held = deferred<void>();
    mocks.resendVerification.mockReturnValueOnce(held.promise);
    const previousPending = vi.fn();
    const currentPending = vi.fn();
    const view = render(
      <VerifyEmail registrationEmail="pending@example.com" onPendingChange={previousPending} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    view.rerender(
      <VerifyEmail registrationEmail="pending@example.com" onPendingChange={currentPending} />,
    );
    expect(mocks.resendVerification).toHaveBeenCalledTimes(1);
    expect(previousPending.mock.calls).toEqual([[true], [false]]);
    expect(currentPending.mock.calls).toEqual([[true]]);

    await act(async () => held.resolve());

    expect(previousPending.mock.calls).toEqual([[true], [false]]);
    expect(currentPending.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByRole("status")).toHaveTextContent("check your inbox");
  });

  it("does not apply an old token response while a newer token is pending", async () => {
    const old = deferred<{ id: string }>();
    const current = deferred<{ id: string }>();
    mocks.verifyEmail.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const view = render(<VerifyEmail />);
    const replaceUrl = vi.spyOn(window.history, "replaceState");
    mocks.search = "token=new-token";
    window.history.pushState(null, "", `/verify-email?${mocks.search}`);
    view.rerender(<VerifyEmail />);
    expect(mocks.verifyEmail).toHaveBeenCalledTimes(2);

    await act(async () => old.resolve({ id: "old-user" }));

    expect(screen.getByRole("status")).toHaveTextContent("Verifying…");
    expect(replaceUrl).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?token=new-token");
    expect(mocks.markRegistrationVerified).not.toHaveBeenCalled();
    await act(async () => current.resolve({ id: "current-user" }));
    expect(screen.getByRole("heading", { name: "Email verified" })).toBeVisible();
    expect(mocks.markRegistrationVerified).toHaveBeenCalledExactlyOnceWith("current-user");
    expect(replaceUrl).toHaveBeenCalledTimes(1);
  });

  it("ignores an old response when confirmation mode changes", async () => {
    const old = deferred<{ id: string }>();
    mocks.verifyEmail.mockReturnValueOnce(old.promise);
    mocks.confirmEmailChange.mockResolvedValueOnce(undefined);
    const view = render(<VerifyEmail />);
    const replaceUrl = vi.spyOn(window.history, "replaceState");
    view.rerender(<VerifyEmail mode="email-change" />);

    expect(await screen.findByRole("heading", { name: "Email changed" })).toBeVisible();
    await act(async () => old.resolve({ id: "old-user" }));
    expect(screen.getByRole("heading", { name: "Email changed" })).toBeVisible();
    expect(mocks.markRegistrationVerified).not.toHaveBeenCalled();
    expect(mocks.notifyAuthChanged).toHaveBeenCalledTimes(1);
    expect(replaceUrl).toHaveBeenCalledTimes(1);
  });

  it.each(modes)("ignores a held %s retry response after unmount", async (mode) => {
    const held = deferred<ReturnType<typeof successResult>>();
    const confirm = confirmationApi(mode);
    confirm.mockRejectedValueOnce(new TypeError("Offline")).mockReturnValueOnce(held.promise);
    const pending = vi.fn();
    const view = render(<VerifyEmail mode={mode} onPendingChange={pending} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(screen.getByRole("button", { name: "Verifying…" })).toBeDisabled();
    const replaceUrl = vi.spyOn(window.history, "replaceState");
    view.unmount();
    pending.mockClear();

    await act(async () => held.resolve(successResult(mode)));

    expect(replaceUrl).not.toHaveBeenCalled();
    expect(mocks.markRegistrationVerified).not.toHaveBeenCalled();
    expect(mocks.notifyAuthChanged).not.toHaveBeenCalled();
    expect(pending).not.toHaveBeenCalled();
  });

  it("releases pending feedback for the current callback without resubmitting the token", async () => {
    const held = deferred<{ id: string }>();
    mocks.verifyEmail.mockReturnValueOnce(held.promise);
    const original = vi.fn();
    const current = vi.fn();
    const view = render(<VerifyEmail onPendingChange={original} />);
    view.rerender(<VerifyEmail onPendingChange={current} />);
    expect(original.mock.calls).toEqual([[true], [false]]);
    expect(current.mock.calls).toEqual([[true]]);
    expect(mocks.verifyEmail).toHaveBeenCalledTimes(1);

    await act(async () => held.resolve({ id: "verified-user" }));

    await waitFor(() => expect(current.mock.calls).toEqual([[true], [false]]));
    expect(original.mock.calls).toEqual([[true], [false]]);
  });
});
