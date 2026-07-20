import { describe, expect, it } from "vitest";

import {
  activeCells,
  cellKey,
  createEditorState,
  editorPayload,
  editorReducer,
} from "@/features/editor/editor-state";

describe("editorReducer", () => {
  it("selects a rectangular range and applies a shared patch", () => {
    let state = createEditorState(5);
    state = editorReducer(state, {
      type: "select-rectangle",
      anchor: { row: 1, column: 1 },
      focus: { row: 2, column: 3 },
    });
    expect(state.selectedKeys).toHaveLength(6);

    state = editorReducer(state, {
      type: "patch-selected",
      patch: { text: "Shared", backgroundOpacity: 0.4 },
    });
    for (const key of state.selectedKeys) {
      expect(state.cells[key]?.text).toBe("Shared");
      expect(state.cells[key]?.backgroundOpacity).toBe(0.4);
    }
  });

  it("keeps cell coordinates stable across resizing", () => {
    let state = createEditorState(5);
    state = editorReducer(state, {
      type: "select-rectangle",
      anchor: { row: 4, column: 4 },
      focus: { row: 4, column: 4 },
    });
    state = editorReducer(state, {
      type: "patch-selected",
      patch: { text: "Bottom right" },
    });

    state = editorReducer(state, { type: "set-size", size: 3 });
    expect(activeCells(state)).toHaveLength(9);
    expect(state.cells[cellKey(4, 4)]?.text).toBe("Bottom right");

    state = editorReducer(state, { type: "set-size", size: 5 });
    expect(state.cells[cellKey(4, 4)]?.text).toBe("Bottom right");
  });

  it("serializes only cells inside the active board", () => {
    let state = createEditorState(5);
    state = editorReducer(state, { type: "set-size", size: 3 });
    const payload = editorPayload(state);
    expect(payload.cells).toHaveLength(9);
    expect(payload.cells.at(-1)).toMatchObject({ row: 2, column: 2 });
  });

  it("enforces the supported size boundaries", () => {
    let state = createEditorState();
    state = editorReducer(state, { type: "set-size", size: 2 });
    expect(state.size).toBe(3);
    state = editorReducer(state, { type: "set-size", size: 42 });
    expect(state.size).toBe(10);
  });

  it("applies a completed upload to the cells selected when it started", () => {
    let state = createEditorState(3);
    const originalSelection = [cellKey(0, 0), cellKey(0, 1)];
    state = editorReducer(state, {
      type: "select-rectangle",
      anchor: { row: 2, column: 2 },
      focus: { row: 2, column: 2 },
    });
    state = editorReducer(state, {
      type: "set-cell-images",
      keys: originalSelection,
      media: {
        previewUrl: null,
        asset: {
          id: "asset-id",
          kind: "cell_image",
          status: "ready",
          url: "/api/v1/media/asset-id/",
          mime_type: "image/png",
        },
      },
    });

    expect(state.cells[cellKey(0, 0)]?.image.asset?.id).toBe("asset-id");
    expect(state.cells[cellKey(0, 1)]?.image.asset?.id).toBe("asset-id");
    expect(state.cells[cellKey(2, 2)]?.image.asset).toBeNull();
  });
});
