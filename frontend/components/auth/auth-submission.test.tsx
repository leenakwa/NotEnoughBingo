import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { ForgotPasswordForm, ResetPasswordForm } from "@/components/auth/password-forms";
import { RegisterForm } from "@/components/auth/register-form";
import { VerifyEmail } from "@/components/auth/verify-email";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  resendVerification: vi.fn(),
  replace: vi.fn(),
  query: "uid=example-uid&token=example-token",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

vi.mock("@/lib/api/client", () => ({
  api: { auth: mocks },
  errorMessage: (error: Error) => error.message,
  fieldValidationMessage: (
    error: Error & { fieldErrors?: Record<string, string> },
    field: string,
  ) => error.fieldErrors?.[field] ?? null,
}));

describe("auth submission safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.query = "uid=example-uid&token=example-token";
    mocks.session.mockResolvedValue(null);
  });

  it.each([
    ["registration", RegisterForm, "register", "Password"],
    ["login", LoginForm, "login", "Password"],
    ["reset request", ForgotPasswordForm, "requestPasswordReset", null],
    ["reset confirmation", ResetPasswordForm, "resetPassword", "New password"],
  ] as const)(
    "sends one pending request and permits retry after failure (%s)",
    async (_label, Form, method, passwordLabel) => {
      let reject!: (error: Error) => void;
      mocks[method].mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      );
      render(<Form />);
      if (Form !== ResetPasswordForm) {
        fireEvent.change(await screen.findByLabelText("Email"), {
          target: { value: "user@example.test" },
        });
      }
      if (Form === RegisterForm) {
        const username = screen.getByRole("textbox", { name: /^Username/ });
        fireEvent.change(username, { target: { value: "  author  " } });
        fireEvent.blur(username);
        expect(username).toHaveValue("author");
      }
      if (passwordLabel) {
        fireEvent.change(screen.getByLabelText(passwordLabel), {
          target: { value: "example password value" },
        });
      }
      const submit = screen
        .getAllByRole("button")
        .find((button) => button.getAttribute("type") === "submit")!;
      const form = submit.closest("form")!;
      await act(async () => {
        fireEvent.submit(form);
        fireEvent.submit(form);
      });
      expect(mocks[method]).toHaveBeenCalledOnce();
      expect(submit).toBeDisabled();
      await act(async () => {
        reject(new Error("The service is temporarily unavailable."));
      });
      expect(screen.getByRole("alert")).toHaveTextContent("temporarily unavailable");
      expect(submit).toBeEnabled();
      if (passwordLabel)
        expect(screen.getByLabelText(passwordLabel)).toHaveValue("example password value");
      mocks[method].mockResolvedValueOnce(method === "login" ? { user: { id: "user-id" } } : {});
      await act(async () => {
        fireEvent.submit(form);
      });
      expect(mocks[method]).toHaveBeenCalledTimes(2);
    },
  );

  it("does not resend verification twice in the same event batch", async () => {
    mocks.query = "email=user%40example.test";
    let finish!: () => void;
    mocks.resendVerification.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<VerifyEmail />);
    const button = screen.getByRole("button", { name: "Resend verification email" });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(mocks.resendVerification).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    await act(async () => {
      finish();
    });
    expect(button).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("check your inbox");
  });

  it("places registration errors beside their fields and focuses the first", async () => {
    mocks.register.mockRejectedValueOnce(
      Object.assign(new Error("Invalid registration"), {
        fieldErrors: {
          username: "This username is unavailable.",
          password: "Choose a stronger password.",
        },
      }),
    );
    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.test" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Username/ }), {
      target: { value: "taken_name" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Valid-looking-password-42" },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!);
    });

    const username = screen.getByRole("textbox", { name: /^Username/ });
    expect(username).toHaveFocus();
    expect(username).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("This username is unavailable.")).toHaveAttribute("role", "alert");
    expect(screen.getByText("Choose a stronger password.")).toHaveAttribute("role", "alert");
    fireEvent.change(username, { target: { value: "available_name" } });
    expect(username).toHaveAttribute("aria-invalid", "false");
  });

  it("places a weak reset password error beside the input", async () => {
    mocks.resetPassword.mockRejectedValueOnce(
      Object.assign(new Error("Invalid password"), {
        fieldErrors: { new_password: "This password is too common." },
      }),
    );
    render(<ResetPasswordForm />);
    const password = screen.getByLabelText("New password");
    fireEvent.change(password, { target: { value: "common-password-42" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Update password" }).closest("form")!);
    });
    expect(password).toHaveFocus();
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("This password is too common.")).toHaveAttribute("role", "alert");
  });
});
