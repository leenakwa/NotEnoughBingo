import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import { describe, expect, it } from "vitest";

import { CellInspector } from "@/features/editor/cell-inspector";
import { cellKey, createEditorState, editorReducer } from "@/features/editor/editor-state";

function InspectorHarness({ multiple = true }: { multiple?: boolean }) {
  const initial = createEditorState(3);
  const selected = editorReducer(initial, {
    type: "select-rectangle",
    anchor: { row: 0, column: 0 },
    focus: multiple ? { row: 0, column: 1 } : { row: 0, column: 0 },
  });
  const [state, dispatch] = useReducer(editorReducer, selected);
  return (
    <>
      <CellInspector
        state={state}
        dispatch={dispatch}
        uploadPending={false}
        onCancelUpload={() => undefined}
        uploadFeedback={null}
        onImageSelected={() => undefined}
      />
      <output data-testid="texts">
        {state.cells[cellKey(0, 0)]?.text}|{state.cells[cellKey(0, 1)]?.text}
      </output>
    </>
  );
}

describe("CellInspector multi-select text safety", () => {
  it("does not expose bulk text editing until the user explicitly enables it", async () => {
    const user = userEvent.setup();
    render(<InspectorHarness />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Set same text for 2 cells" }));
    const text = screen.getByRole("textbox", { name: /Shared text for 2 cells/ });
    await user.type(text, "Shared");

    expect(screen.getByTestId("texts")).toHaveTextContent("Shared|Shared");
  });

  it("keeps normal text editing available for one selected cell", () => {
    render(<InspectorHarness multiple={false} />);
    expect(screen.getByRole("textbox", { name: "Text" })).toBeEnabled();
    expect(screen.queryByText(/Set same text/)).not.toBeInTheDocument();
  });
});
