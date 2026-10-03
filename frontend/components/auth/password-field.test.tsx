import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { PasswordField } from "@/components/auth/password-field";

function Example() {
  const [password, setPassword] = useState("");
  return (
    <PasswordField
      label="Password"
      autoComplete="new-password"
      minLength={12}
      hint="Use at least 12 characters."
      value={password}
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
});
