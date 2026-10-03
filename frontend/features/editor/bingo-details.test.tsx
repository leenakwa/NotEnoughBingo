import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BingoDetails } from "@/features/editor/bingo-details";
import { createEditorState, editorReducer } from "@/features/editor/editor-state";

describe("BingoDetails cover preview", () => {
  it("describes the cover and shows a useful fallback when it cannot load", () => {
    const titled = editorReducer(createEditorState(3), {
      type: "set-title",
      value: "Weekend plans",
    });
    const state = editorReducer(titled, {
      type: "set-cover",
      media: {
        asset: {
          id: "44444444-4444-4444-8444-444444444444",
          kind: "cover",
          status: "ready",
          url: "/api/v1/media/missing/",
          mime_type: "image/webp",
        },
        previewUrl: null,
      },
    });
    render(
      <BingoDetails
        state={state}
        dispatch={vi.fn()}
        onBack={vi.fn()}
        onCoverSelected={vi.fn()}
        coverUploadPending={false}
        uploadPending={false}
        pendingAction={null}
        message=""
        error=""
        onSave={vi.fn()}
        onPublish={vi.fn()}
        onExport={vi.fn()}
        exportAvailable={false}
        saveStatus={null}
      />,
    );
    fireEvent.error(screen.getByAltText("Cover preview for Weekend plans"));
    expect(screen.getByText("Cover unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove" })).toBeVisible();
  });
});
