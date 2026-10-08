import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useReducer } from "react";
import { describe, expect, it } from "vitest";

import { CellInspector } from "@/features/editor/cell-inspector";
import { cellKey, createEditorState, editorReducer } from "@/features/editor/editor-state";

function InspectorHarness({
  multiple = true,
  image = false,
  imageDescriptionValidationKey = null,
}: {
  multiple?: boolean;
  image?: boolean;
  imageDescriptionValidationKey?: string | null;
}) {
  const initial = createEditorState(3);
  let selected = editorReducer(initial, {
    type: "select-rectangle",
    anchor: { row: 0, column: 0 },
    focus: multiple ? { row: 0, column: 1 } : { row: 0, column: 0 },
  });
  if (image) {
    selected = editorReducer(selected, {
      type: "set-selected-image",
      media: { asset: null, previewUrl: "blob:cell-image" },
    });
  }
  const [state, dispatch] = useReducer(editorReducer, selected);
  return (
    <>
      <CellInspector
        state={state}
        dispatch={dispatch}
        imageDescriptionValidationKey={imageDescriptionValidationKey}
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
    expect(text).toHaveAccessibleDescription(
      "Up to 100 characters. This replaces the text in every selected cell.",
    );
    await user.type(text, "Shared");

    expect(screen.getByTestId("texts")).toHaveTextContent("Shared|Shared");
  });

  it("keeps normal text editing available for one selected cell", () => {
    render(<InspectorHarness multiple={false} />);
    expect(screen.getByRole("textbox", { name: "Text" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Text" })).toHaveAccessibleDescription(
      "Up to 100 characters.",
    );
    expect(screen.queryByText(/Set same text/)).not.toBeInTheDocument();
  });
});

describe("CellInspector image-description validation", () => {
  it("explains the required description without reporting an error before publication", () => {
    render(<InspectorHarness multiple={false} image />);
    const description = screen.getByRole("textbox", { name: "Image description" });
    expect(description).toHaveAttribute("aria-required", "true");
    expect(description).toHaveAttribute("aria-invalid", "false");
    expect(description).toHaveAccessibleDescription(
      "Required for image-only cells so everyone can understand them. Up to 160 characters.",
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["cell text", "image removal"])("clears the description error after %s", (correction) => {
    render(<InspectorHarness multiple={false} image imageDescriptionValidationKey="0:0" />);
    const description = screen.getByRole("textbox", { name: "Image description" });
    expect(description).toHaveFocus();
    expect(description).toHaveAttribute("aria-invalid", "true");

    if (correction === "cell text") {
      fireEvent.change(screen.getByRole("textbox", { name: "Text" }), {
        target: { value: "An accessible cell label" },
      });
      expect(description).toHaveAttribute("aria-required", "false");
      expect(description).toHaveAttribute("aria-invalid", "false");
      expect(description).toHaveAccessibleDescription(
        "Required for image-only cells so everyone can understand them. Up to 160 characters.",
      );
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Remove cell image" }));
      expect(screen.queryByRole("textbox", { name: "Image description" })).not.toBeInTheDocument();
    }
    expect(
      screen.queryByText("Describe this image-only cell before publishing."),
    ).not.toBeInTheDocument();
  });

  it("keeps focus in cell text when editing makes the image description required again", () => {
    render(<InspectorHarness multiple={false} image imageDescriptionValidationKey="0:0" />);
    const description = screen.getByRole("textbox", { name: "Image description" });
    expect(description).toHaveFocus();
    const text = screen.getByRole("textbox", { name: "Text" });
    text.focus();
    fireEvent.change(text, { target: { value: "Cell text" } });
    expect(description).toHaveAttribute("aria-invalid", "false");
    fireEvent.change(text, { target: { value: "" } });
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(text).toHaveFocus();
  });
});
