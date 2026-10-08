import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { usePendingInputFocus } from "@/lib/use-pending-input-focus";

afterEach(() => vi.restoreAllMocks());

it.each(["focus", "Tab", "pointer", "window blur", "owner change"] as const)(
  "does not reclaim body focus after %s while a checkbox save is pending",
  (departure) => {
    let finishRequest!: () => void;
    let ownsRequest = true;
    function Settings({ pending }: { pending: boolean }) {
      const beginFocusRestore = usePendingInputFocus(pending);
      return (
        <>
          <input
            aria-label="Preference"
            type="checkbox"
            disabled={pending}
            onChange={(event) => {
              finishRequest = beginFocusRestore(event.currentTarget, () => ownsRequest);
            }}
          />
          <button>Elsewhere</button>
        </>
      );
    }
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const view = render(<Settings pending={false} />);
    const checkbox = screen.getByRole("checkbox", { name: "Preference" });
    checkbox.focus();
    fireEvent.click(checkbox);
    view.rerender(<Settings pending />);
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
    if (departure === "focus") {
      const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
      elsewhere.focus();
      elsewhere.blur();
    } else if (departure === "Tab") fireEvent.keyDown(document.body, { key: "Tab" });
    else if (departure === "pointer") fireEvent.pointerDown(document.body);
    else if (departure === "window blur") fireEvent.blur(window);
    else ownsRequest = false;
    expect(document.body).toHaveFocus();
    finishRequest();
    view.rerender(<Settings pending={false} />);
    expect(checkbox).toBeEnabled();
    expect(document.body).toHaveFocus();
  },
);

it("does not focus an input that was not focused when its save started", () => {
  let finishRequest!: () => void;
  function Settings({ pending }: { pending: boolean }) {
    const beginFocusRestore = usePendingInputFocus(pending);
    return (
      <input
        aria-label="Preference"
        type="checkbox"
        disabled={pending}
        onChange={(event) => {
          finishRequest = beginFocusRestore(event.currentTarget, () => true);
        }}
      />
    );
  }
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const view = render(<Settings pending={false} />);
  const checkbox = screen.getByRole("checkbox", { name: "Preference" });
  fireEvent.click(checkbox);
  view.rerender(<Settings pending />);
  finishRequest();
  view.rerender(<Settings pending={false} />);
  expect(document.body).toHaveFocus();
});

it("discards a checkbox's pending focus restoration when the settings unmount", () => {
  let finishRequest!: () => void;
  function Settings() {
    const beginFocusRestore = usePendingInputFocus(false);
    return (
      <input
        aria-label="Preference"
        type="checkbox"
        onChange={(event) => {
          finishRequest = beginFocusRestore(event.currentTarget, () => true);
        }}
      />
    );
  }
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const view = render(<Settings />);
  const checkbox = screen.getByRole("checkbox", { name: "Preference" });
  checkbox.focus();
  fireEvent.click(checkbox);
  checkbox.blur();
  const focus = vi.spyOn(checkbox, "focus");
  view.unmount();
  finishRequest();
  render(<Settings />);
  expect(document.body).toHaveFocus();
  expect(focus).not.toHaveBeenCalled();
});
