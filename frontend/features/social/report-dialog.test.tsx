import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportDialog } from "@/features/social/report-dialog";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  api: { reports: { create } },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
}));

function report(onClose = vi.fn()) {
  render(
    <ReportDialog
      targetType="bingo"
      targetId="33333333-3333-4333-8333-333333333333"
      targetLabel="bingo"
      onClose={onClose}
    />,
  );
  return onClose;
}

describe("report form recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    create.mockReset();
  });

  it("requires confirmation before discarding written context", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    const onClose = report();
    const context = screen.getByLabelText("Additional context (optional)", { exact: true });
    await user.type(context, "Moderator context 🎲{Enter}<literal> & useful detail");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(context).toHaveValue("Moderator context 🎲\n<literal> & useful detail");
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Close report dialog" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks a pending report, sends once and focuses an accessible success action", async () => {
    let resolve: () => void = () => undefined;
    create.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const user = userEvent.setup();
    const onClose = report();
    const context = screen.getByLabelText("Additional context (optional)", { exact: true });
    await user.type(context, "Written report context");
    act(() => {
      fireEvent.submit(context.closest("form")!);
      fireEvent.submit(context.closest("form")!);
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(context).toBeDisabled();
    expect(screen.getByLabelText("Reason", { exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close report dialog" })).toBeDisabled();
    await act(async () => {
      resolve();
    });
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-describedby", "report-success");
    expect(screen.getByRole("status")).toHaveAttribute("id", "report-success");
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("preserves context and reenables controls after an unsuccessful submission", async () => {
    create.mockRejectedValue(new Error("Reports are unavailable. Try again."));
    const user = userEvent.setup();
    report();
    const context = screen.getByLabelText("Additional context (optional)", { exact: true });
    await user.type(context, "Keep this moderator context");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reports are unavailable. Try again.",
    );
    expect(context).toHaveValue("Keep this moderator context");
    expect(context).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send report" })).toBeEnabled();
  });
});
