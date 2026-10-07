import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { PasswordField } from "@/components/auth/password-field";

function Example({ disabled = false }: { disabled?: boolean }) {
  const [password, setPassword] = useState("");
  return (
    <PasswordField
      label="Password"
      autoComplete="new-password"
      minLength={12}
      hint="Use at least 12 characters."
      value={password}
      disabled={disabled}
      onChange={(event) => setPassword(event.target.value)}
    />
  );
}

describe("PasswordField", () => {
  it("lets a keyboard user inspect and conceal the same password", async () => {
    const user = userEvent.setup();
    render(<Example />);

    const input = screen.getByLabelText("Password");
    await user.type(input, "long-safe-password");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("long-safe-password");

    await user.tab();
    expect(screen.getByRole("button", { name: "Show" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("long-safe-password");

    await user.keyboard("{Enter}");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("long-safe-password");
  });

  it("locks both typing and visibility controls while disabled and keeps the entered password", async () => {
    const user = userEvent.setup();
    const view = render(<Example />);
    const input = screen.getByLabelText("Password");
    await user.type(input, "synthetic password");
    await user.click(screen.getByRole("button", { name: "Show" }));
    view.rerender(<Example disabled />);

    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hide" })).toBeDisabled();
    await user.type(input, "late edit");
    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(input).toHaveValue("synthetic password");
    expect(input).toHaveAttribute("type", "text");

    view.rerender(<Example />);
    await user.click(screen.getByRole("button", { name: "Hide" }));
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute("type", "password");
  });
});
