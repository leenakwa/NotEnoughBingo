import type {
  BingoDraft,
  CompletionStyle,
  MediaAsset,
  RevisionCell,
  Visibility,
} from "@/lib/api/types";

export const MIN_BINGO_SIZE = 3;
export const MAX_BINGO_SIZE = 10;

export type BorderStyle = "solid" | "dashed" | "dotted" | "double";
export type TextFormat = "bold" | "italic" | "underline" | "strikethrough";
export type EditorStep = "board" | "details";

export interface EditorMedia {
  asset: MediaAsset | null;
  previewUrl: string | null;
}

export interface EditorCell {
  id?: string;
  row: number;
  column: number;
  text: string;
  textColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  image: EditorMedia;
  imageOpacity: number;
  borderColor: string;
  borderWidth: number;
  borderStyle: BorderStyle;
}

export interface EditorState {
  size: number;
  cells: Record<string, EditorCell>;
  selectedKeys: string[];
  primaryKey: string | null;
  title: string;
  description: string;
  tags: string[];
  visibility: Visibility;
  completionStyle: CompletionStyle;
  boardBackground: EditorMedia;
  cover: EditorMedia;
  bingoId: string | null;
  draftId: string | null;
  version: number;
  lastSavedAt: string | null;
}

type CellPatch = Partial<
  Pick<
    EditorCell,
    | "text"
    | "textColor"
    | "backgroundColor"
    | "backgroundOpacity"
    | "imageOpacity"
    | "borderColor"
    | "borderWidth"
    | "borderStyle"
  >
>;

export type EditorAction =
  | { type: "set-size"; size: number }
  | {
      type: "select-rectangle";
      anchor: { row: number; column: number };
      focus: { row: number; column: number };
    }
  | { type: "clear-selection" }
  | { type: "patch-selected"; patch: CellPatch }
  | { type: "toggle-format"; format: TextFormat; enabled?: boolean }
  | { type: "set-selected-image"; media: EditorMedia }
  | { type: "set-cell-images"; keys: string[]; media: EditorMedia }
  | { type: "set-board-background"; media: EditorMedia }
  | { type: "set-cover"; media: EditorMedia }
  | { type: "set-title"; value: string }
  | { type: "set-description"; value: string }
  | { type: "set-visibility"; value: Visibility }
  | { type: "set-completion-style"; value: CompletionStyle }
  | { type: "add-tag"; value: string }
  | { type: "remove-tag"; value: string }
  | { type: "hydrate"; draft: BingoDraft }
  | { type: "saved"; draft: BingoDraft };

export function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function createDefaultCell(row: number, column: number): EditorCell {
  return {
    row,
    column,
    text: "",
    textColor: "#000000",
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    backgroundColor: "#ffffff",
    backgroundOpacity: 1,
    image: { asset: null, previewUrl: null },
    imageOpacity: 1,
    borderColor: "#000000",
    borderWidth: 1,
    borderStyle: "solid",
  };
}

export function createEditorState(size = 5): EditorState {
  const cells: Record<string, EditorCell> = {};
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      cells[cellKey(row, column)] = createDefaultCell(row, column);
    }
  }
  return {
    size,
    cells,
    selectedKeys: [],
    primaryKey: null,
    title: "",
    description: "",
    tags: [],
    visibility: "public",
    completionStyle: "checkmark",
    boardBackground: { asset: null, previewUrl: null },
    cover: { asset: null, previewUrl: null },
    bingoId: null,
    draftId: null,
    version: 0,
    lastSavedAt: null,
  };
}

function clampSize(size: number): number {
  return Math.max(MIN_BINGO_SIZE, Math.min(MAX_BINGO_SIZE, Math.round(size)));
}

function ensureCells(state: EditorState, size: number): Record<string, EditorCell> {
  const cells = { ...state.cells };
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const key = cellKey(row, column);
      cells[key] ??= createDefaultCell(row, column);
    }
  }
  return cells;
}

function updateSelected(state: EditorState, update: (cell: EditorCell) => EditorCell): EditorState {
  if (state.selectedKeys.length === 0) return state;
  const cells = { ...state.cells };
  for (const key of state.selectedKeys) {
    const cell = cells[key];
    if (cell) cells[key] = update(cell);
  }
  return { ...state, cells };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "set-size": {
      const size = clampSize(action.size);
      return {
        ...state,
        size,
        cells: ensureCells(state, size),
        selectedKeys: [],
        primaryKey: null,
      };
    }
    case "select-rectangle": {
      const minRow = Math.max(0, Math.min(action.anchor.row, action.focus.row));
      const maxRow = Math.min(state.size - 1, Math.max(action.anchor.row, action.focus.row));
      const minColumn = Math.max(0, Math.min(action.anchor.column, action.focus.column));
      const maxColumn = Math.min(
        state.size - 1,
        Math.max(action.anchor.column, action.focus.column),
      );
      const selectedKeys: string[] = [];
      for (let row = minRow; row <= maxRow; row += 1) {
        for (let column = minColumn; column <= maxColumn; column += 1) {
          selectedKeys.push(cellKey(row, column));
        }
      }
      return {
        ...state,
        selectedKeys,
        primaryKey: cellKey(action.anchor.row, action.anchor.column),
      };
    }
    case "clear-selection":
      return { ...state, selectedKeys: [], primaryKey: null };
    case "patch-selected":
      return updateSelected(state, (cell) => ({ ...cell, ...action.patch }));
    case "toggle-format": {
      const primary = state.primaryKey ? state.cells[state.primaryKey] : null;
      const enabled = action.enabled ?? !(primary?.[action.format] ?? false);
      return updateSelected(state, (cell) => ({
        ...cell,
        [action.format]: enabled,
      }));
    }
    case "set-selected-image":
      return updateSelected(state, (cell) => ({ ...cell, image: action.media }));
    case "set-cell-images": {
      const cells = { ...state.cells };
      for (const key of action.keys) {
        const cell = cells[key];
        if (cell) cells[key] = { ...cell, image: action.media };
      }
      return { ...state, cells };
    }
    case "set-board-background":
      return { ...state, boardBackground: action.media };
    case "set-cover":
      return { ...state, cover: action.media };
    case "set-title":
      return { ...state, title: action.value };
    case "set-description":
      return { ...state, description: action.value };
    case "set-visibility":
      return { ...state, visibility: action.value };
    case "set-completion-style":
      return { ...state, completionStyle: action.value };
    case "add-tag": {
      const value = action.value.trim().toLowerCase();
      if (!value || state.tags.includes(value) || state.tags.length >= 15) {
        return state;
      }
      return { ...state, tags: [...state.tags, value] };
    }
    case "remove-tag":
      return {
        ...state,
        tags: state.tags.filter((tag) => tag !== action.value),
      };
    case "hydrate":
      return editorStateFromDraft(action.draft);
    case "saved": {
      const cells = { ...state.cells };
      for (const savedCell of action.draft.cells) {
        const key = cellKey(savedCell.row, savedCell.column);
        const current = cells[key];
        if (current) cells[key] = { ...current, id: savedCell.id };
      }
      return {
        ...state,
        cells,
        bingoId: action.draft.bingo_id,
        draftId: action.draft.id,
        version: action.draft.version,
        lastSavedAt: action.draft.updated_at,
      };
    }
  }
}

export function activeCells(state: EditorState): EditorCell[] {
  const cells: EditorCell[] = [];
  for (let row = 0; row < state.size; row += 1) {
    for (let column = 0; column < state.size; column += 1) {
      const cell = state.cells[cellKey(row, column)];
      if (cell) cells.push(cell);
    }
  }
  return cells;
}

export function selectedPrimaryCell(state: EditorState): EditorCell | null {
  return state.primaryKey ? (state.cells[state.primaryKey] ?? null) : null;
}

function revisionCellToEditor(cell: RevisionCell): EditorCell {
  return {
    id: cell.id,
    row: cell.row,
    column: cell.column,
    text: cell.text,
    textColor: cell.text_color,
    bold: cell.bold,
    italic: cell.italic,
    underline: cell.underline,
    strikethrough: cell.strikethrough,
    backgroundColor: cell.background_color,
    backgroundOpacity: cell.background_opacity,
    image: { asset: cell.image, previewUrl: null },
    imageOpacity: cell.image_opacity,
    borderColor: cell.border_color,
    borderWidth: cell.border_width,
    borderStyle: cell.border_style,
  };
}

export function editorStateFromDraft(draft: BingoDraft): EditorState {
  const state = createEditorState(draft.size);
  const cells = { ...state.cells };
  for (const cell of draft.cells) {
    cells[cellKey(cell.row, cell.column)] = revisionCellToEditor(cell);
  }
  return {
    ...state,
    cells,
    title: draft.title,
    description: draft.description,
    tags: draft.tags.map((tag) => tag.name),
    visibility: draft.visibility,
    completionStyle: draft.completion_style,
    boardBackground: { asset: draft.board_background, previewUrl: null },
    cover: { asset: draft.cover, previewUrl: null },
    bingoId: draft.bingo_id,
    draftId: draft.id,
    version: draft.version,
    lastSavedAt: draft.updated_at,
  };
}

export function editorPayload(state: EditorState) {
  return {
    title: state.title.trim(),
    description: state.description.trim(),
    size: state.size,
    visibility: state.visibility,
    completion_style: state.completionStyle,
    board_background_id: state.boardBackground.asset?.id ?? null,
    cover_id: state.cover.asset?.id ?? null,
    tags: state.tags,
    cells: activeCells(state).map((cell) => ({
      id: cell.id,
      row: cell.row,
      column: cell.column,
      text: cell.text,
      text_color: cell.textColor,
      bold: cell.bold,
      italic: cell.italic,
      underline: cell.underline,
      strikethrough: cell.strikethrough,
      background_color: cell.backgroundColor,
      background_opacity: cell.backgroundOpacity,
      image_asset_id: cell.image.asset?.id ?? null,
      image_opacity: cell.imageOpacity,
      border_color: cell.borderColor,
      border_width: cell.borderWidth,
      border_style: cell.borderStyle,
    })),
  };
}
