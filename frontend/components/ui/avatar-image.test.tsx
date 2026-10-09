import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvatarImage } from "@/components/ui/avatar-image";

describe("AvatarImage", () => {
  it("shows a fallback when the avatar request fails", () => {
    const view = render(
      <AvatarImage src="/broken.webp" width={44} height={44} fallback={<span>A</span>} />,
    );
    fireEvent.error(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("A")).toBeVisible();
  });

  it("can show a new avatar after an older URL failed", () => {
    const view = render(
      <AvatarImage src="/broken.webp" width={44} height={44} fallback={<span>A</span>} />,
    );
    fireEvent.error(view.container.querySelector("img")!);
    view.rerender(<AvatarImage src="/new.webp" width={44} height={44} fallback={<span>A</span>} />);
    expect(view.container.querySelector("img")).toHaveAttribute("src", "/new.webp");
  });
});
