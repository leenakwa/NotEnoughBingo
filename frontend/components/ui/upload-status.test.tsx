import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadStatus } from "@/components/ui/upload-status";
import type { UploadProgress } from "@/lib/uploads";

describe("UploadStatus", () => {
  it("announces measurable upload progress and keeps cancellation available at 100 percent", () => {
    const cancel = vi.fn();
    const view = render(
      <UploadStatus phase="uploading" progress={{ loaded: 123, total: 400 }} onCancel={cancel} />,
    );
    const progress = screen.getByRole("progressbar", { name: "Uploading image…" });
    expect(progress).toHaveAttribute("value", "30");
    expect(progress).toHaveAttribute("max", "100");
    expect(screen.getByRole("status")).toHaveTextContent("Uploading image… 30%");

    view.rerender(
      <UploadStatus phase="uploading" progress={{ loaded: 400, total: 400 }} onCancel={cancel} />,
    );
    expect(progress).toHaveAttribute("value", "100");
    expect(screen.getByRole("status")).toHaveTextContent("Uploading image… 100%");
    expect(screen.queryByText(/ready|complete/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each<UploadProgress | null | undefined>([
    undefined,
    null,
    { loaded: 20, total: null },
    { loaded: 20, total: 0 },
    { loaded: 20, total: -1 },
    { loaded: Number.NaN, total: 100 },
    { loaded: -1, total: 100 },
    { loaded: 20, total: Number.POSITIVE_INFINITY },
  ])("keeps unavailable or invalid progress indeterminate: %j", (progress) => {
    render(<UploadStatus phase="uploading" progress={progress} onCancel={vi.fn()} />);
    expect(screen.getByRole("progressbar", { name: "Uploading image…" })).not.toHaveAttribute(
      "value",
    );
    expect(screen.getByRole("status")).not.toHaveTextContent("%");
  });

  it.each(["preparing", "processing"] as const)(
    "keeps the %s phase indeterminate after all bytes are transferred",
    (phase) => {
      render(
        <UploadStatus phase={phase} progress={{ loaded: 400, total: 400 }} onCancel={vi.fn()} />,
      );
      expect(screen.getByRole("progressbar")).not.toHaveAttribute("value");
      expect(screen.getByRole("status")).not.toHaveTextContent("%");
    },
  );

  it("clamps an overreported byte count to 100 percent", () => {
    render(
      <UploadStatus phase="uploading" progress={{ loaded: 500, total: 400 }} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "100");
  });
});
