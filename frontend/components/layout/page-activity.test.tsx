import { fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PageActivity } from "@/components/layout/page-activity";

const mocks = vi.hoisted(() => ({ track: vi.fn(), pathname: "/discover" }));
vi.mock("@/lib/analytics", () => ({ trackInteraction: mocks.track }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));

describe("PageActivity privacy and page transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/discover";
  });

  it("counts real path transitions once and sends categories without IDs or query strings", () => {
    window.history.replaceState({}, "", "/discover?search=private-search-marker");
    const view = render(
      <StrictMode>
        <PageActivity />
      </StrictMode>,
    );
    expect(mocks.track).toHaveBeenCalledOnce();
    mocks.pathname = "/profile/private-name-marker";
    view.rerender(
      <StrictMode>
        <PageActivity />
      </StrictMode>,
    );
    expect(mocks.track).toHaveBeenLastCalledWith("page_view", { metadata: { surface: "profile" } });
    mocks.pathname = "/reset-password";
    view.rerender(
      <StrictMode>
        <PageActivity />
      </StrictMode>,
    );
    expect(mocks.track).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain("marker");
  });

  it("counts same-origin primary navigation without parameters and ignores cancelled navigation", () => {
    render(
      <>
        <PageActivity />
        <a href="/create?private=value" onClick={(event) => event.preventDefault()}>
          Create board
        </a>
        <a href="https://example.test/login">External</a>
        <a
          href="/login"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          Cancelled
        </a>
      </>,
    );
    // Cancel jsdom's navigation after the tracker has seen the click.
    const cancelNavigation = (event: Event) => event.preventDefault();
    document.addEventListener("click", cancelNavigation);
    fireEvent.click(document.querySelector('a[href^="/create"]')!);
    expect(mocks.track).toHaveBeenLastCalledWith("cta", {
      metadata: { surface: "discover", action: "create" },
    });
    fireEvent.click(document.querySelector('a[href^="https:"]')!);
    fireEvent.click(document.querySelector('a[href="/login"]')!);
    document.removeEventListener("click", cancelNavigation);
    expect(mocks.track).toHaveBeenCalledTimes(2);
  });
});
