import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VerifyEmail } from "@/components/auth/verify-email";

const mocks = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("token=single-use-token"),
}));

vi.mock("@/lib/api/client", () => ({
  api: {
    auth: {
      verifyEmail: mocks.verifyEmail,
      resendVerification: vi.fn(),
    },
  },
  errorMessage: () => "The verification link is invalid or has already been used.",
}));

describe("VerifyEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a single-use token once in StrictMode and preserves the success state", async () => {
    mocks.verifyEmail
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Token already used"));

    render(
      <StrictMode>
        <VerifyEmail />
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: "Email verified" })).toBeVisible();
    expect(screen.getByText("Your email address is verified.")).toBeVisible();
    expect(mocks.verifyEmail).toHaveBeenCalledTimes(1);
    expect(mocks.verifyEmail).toHaveBeenCalledWith("single-use-token");
  });
});
