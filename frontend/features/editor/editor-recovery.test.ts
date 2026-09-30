import { beforeEach, describe, expect, it } from "vitest";

import {
  clearAllEditorRecovery,
  clearEditorRecovery,
  readEditorRecovery,
  writeEditorRecovery,
} from "@/features/editor/editor-recovery";
import { cellKey, createEditorState, editorReducer } from "@/features/editor/editor-state";

describe("editor emergency recovery", () => {
  const authorId = "author-a";
  beforeEach(() => window.localStorage.clear());

  it("round-trips unsaved content without persisting temporary object URLs", () => {
    let state = createEditorState(3);
    state = editorReducer(state, {
      type: "select-rectangle",
      anchor: { row: 2, column: 2 },
      focus: { row: 2, column: 2 },
    });
    state = editorReducer(state, {
      type: "patch-selected",
      patch: { text: "Recover me", imageAlt: "A red kite" },
    });
    state = editorReducer(state, {
      type: "set-board-background",
      media: { asset: null, previewUrl: "blob:temporary" },
    });

    expect(writeEditorRecovery(authorId, state)).toBe(true);
    const recovery = readEditorRecovery(authorId);

    expect(recovery?.document.cells[cellKey(2, 2)]?.text).toBe("Recover me");
    expect(recovery?.document.cells[cellKey(2, 2)]?.imageAlt).toBe("A red kite");
    expect(recovery?.document.boardBackground.previewUrl).toBeNull();
    expect(recovery?.serverVersion).toBe(0);
  });

  it("can clear both a new-board and identified-board recovery", () => {
    const fresh = createEditorState(3);
    writeEditorRecovery(authorId, fresh);
    writeEditorRecovery(authorId, { ...fresh, bingoId: "bingo-1", version: 4 });

    clearEditorRecovery(authorId, null, "bingo-1");

    expect(readEditorRecovery(authorId)).toBeNull();
    expect(readEditorRecovery(authorId, "bingo-1")).toBeNull();
  });

  it("does not expose another account's unsaved board and clears recovery on logout", () => {
    const state = editorReducer(createEditorState(3), {
      type: "set-title",
      value: "Private author draft",
    });
    writeEditorRecovery(authorId, state);
    expect(readEditorRecovery("author-b")).toBeNull();
    expect(readEditorRecovery(authorId)?.document.title).toBe("Private author draft");

    clearAllEditorRecovery();
    expect(readEditorRecovery(authorId)).toBeNull();
  });
});
