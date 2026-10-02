import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearSocialDrafts, readReportDraft } from "@/features/social/social-draft-cache";
import { ReportDialog } from "@/features/social/report-dialog";

const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  api: { reports: { create } },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Request failed"),
  fieldValidationMessage: (
    error: Error & { fieldErrors?: Record<string, string> },
    field: string,
  ) => error.fieldErrors?.[field] ?? null,
}));

function report(onClose = vi.fn()) {
  render(
    <ReportDialog
      accountId="22222222-2222-4222-8222-222222222222"
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
    clearSocialDrafts();
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
    expect(
      readReportDraft(
        "22222222-2222-4222-8222-222222222222",
        "bingo",
        "33333333-3333-4333-8333-333333333333",
      ).restored,
    ).toBe(false);
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
    expect(
      readReportDraft(
        "22222222-2222-4222-8222-222222222222",
        "bingo",
        "33333333-3333-4333-8333-333333333333",
      ).restored,
    ).toBe(false);
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["reason", "Reason"],
    ["description", "Additional context (optional)"],
  ] as const)("identifies and focuses the report validation field (%s)", async (field, label) => {
    const message = "Please review this report field.";
    create.mockRejectedValue(
      Object.assign(new Error("Validation failed."), { fieldErrors: { [field]: message } }),
    );
    const user = userEvent.setup();
    report();
    const context = screen.getByLabelText("Additional context (optional)", { exact: true });
    await user.type(context, "Keep this moderator context 🎲");
    await user.click(screen.getByRole("button", { name: "Send report" }));
    const input = screen.getByLabelText(label, { exact: true });
    expect(await screen.findByText(message)).toBeVisible();
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toBeEnabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(context).toHaveValue("Keep this moderator context 🎲");
    if (field === "reason") await user.selectOptions(input, "other");
    else await user.type(input, "x");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(message)).not.toBeInTheDocument();
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

  it("restores the exact reason and context after unmount for the same account and target", async () => {
    const user = userEvent.setup();
    const props = {
      accountId: "22222222-2222-4222-8222-222222222222",
      targetType: "bingo" as const,
      targetId: "33333333-3333-4333-8333-333333333333",
      targetLabel: "bingo",
      onClose: vi.fn(),
    };
    const view = render(<ReportDialog {...props} />);
    await user.selectOptions(screen.getByLabelText("Reason", { exact: true }), "other");
    await user.type(
      screen.getByLabelText("Additional context (optional)", { exact: true }),
      "Keep this private report 🎲{Enter}<literal> & context",
    );
    view.unmount();
    render(<ReportDialog {...props} />);
    expect(screen.getByLabelText("Reason", { exact: true })).toHaveValue("other");
    expect(screen.getByLabelText("Additional context (optional)", { exact: true })).toHaveValue(
      "Keep this private report 🎲\n<literal> & context",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Unsent report restored");
  });

  it("does not carry controlled report text into a different target or account", async () => {
    const user = userEvent.setup();
    const props = {
      accountId: "owner",
      targetType: "profile" as const,
      targetId: "first",
      targetLabel: "profile",
      onClose: vi.fn(),
    };
    const view = render(<ReportDialog {...props} />);
    await user.type(
      screen.getByLabelText("Additional context (optional)", { exact: true }),
      "First account private text",
    );
    view.rerender(<ReportDialog {...props} targetId="second" />);
    expect(screen.getByLabelText("Additional context (optional)", { exact: true })).toHaveValue("");
    view.rerender(<ReportDialog {...props} accountId="another" />);
    expect(screen.getByLabelText("Additional context (optional)", { exact: true })).toHaveValue("");
    view.rerender(<ReportDialog {...props} />);
    expect(screen.getByLabelText("Additional context (optional)", { exact: true })).toHaveValue("");
  });

  it("keeps a report when its target is unavailable without changing the destination", async () => {
    create.mockRejectedValue(new Error("This content is no longer available."));
    const user = userEvent.setup();
    report();
    await user.selectOptions(screen.getByLabelText("Reason", { exact: true }), "other");
    await user.type(
      screen.getByLabelText("Additional context (optional)", { exact: true }),
      "Keep unavailable-target context",
    );
    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This content is no longer available.",
    );
    expect(screen.getByLabelText("Additional context (optional)", { exact: true })).toHaveValue(
      "Keep unavailable-target context",
    );
    expect(create).toHaveBeenCalledWith({
      target_type: "bingo",
      target_id: "33333333-3333-4333-8333-333333333333",
      reason: "other",
      description: "Keep unavailable-target context",
    });
  });
});
