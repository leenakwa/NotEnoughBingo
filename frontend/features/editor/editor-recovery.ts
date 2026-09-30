import {
  createDefaultCell,
  editorDocumentSnapshot,
  type EditorCell,
  type EditorDocumentSnapshot,
  type EditorMedia,
  type EditorState,
} from "@/features/editor/editor-state";

const RECOVERY_SCHEMA = 2;
const RECOVERY_PREFIX = "not-enough-bingo:editor-recovery:v2:";
const LEGACY_RECOVERY_PREFIX = "not-enough-bingo:editor-recovery:v1:";

export interface EditorRecovery {
  schema: typeof RECOVERY_SCHEMA;
  ownerId: string;
  bingoId: string | null;
  serverVersion: number;
  savedAt: string;
  document: EditorDocumentSnapshot;
}

function recoveryKey(ownerId: string, bingoId?: string | null): string {
  return `${RECOVERY_PREFIX}${ownerId}:${bingoId ?? "new"}`;
}

function safeMedia(value: unknown): EditorMedia | null {
  if (!value || typeof value !== "object") return null;
  const media = value as Partial<EditorMedia>;
  if (
    media.asset !== null &&
    (!media.asset || typeof media.asset !== "object" || typeof media.asset.id !== "string")
  ) {
    return null;
  }
  return { asset: media.asset ?? null, previewUrl: null };
}

function safeCell(value: unknown, row: number, column: number): EditorCell | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<EditorCell>;
  const base = createDefaultCell(row, column);
  const image = safeMedia(raw.image);
  if (
    raw.row !== row ||
    raw.column !== column ||
    typeof raw.text !== "string" ||
    typeof raw.textColor !== "string" ||
    typeof raw.bold !== "boolean" ||
    typeof raw.italic !== "boolean" ||
    typeof raw.underline !== "boolean" ||
    typeof raw.strikethrough !== "boolean" ||
    typeof raw.backgroundColor !== "string" ||
    typeof raw.backgroundOpacity !== "number" ||
    !image ||
    (raw.imageAlt !== undefined &&
      (typeof raw.imageAlt !== "string" || raw.imageAlt.length > 160)) ||
    typeof raw.imageOpacity !== "number" ||
    typeof raw.borderColor !== "string" ||
    typeof raw.borderWidth !== "number" ||
    !["solid", "dashed", "dotted", "double"].includes(raw.borderStyle ?? "")
  ) {
    return null;
  }
  return {
    ...base,
    ...raw,
    id: typeof raw.id === "string" ? raw.id : undefined,
    row,
    column,
    image,
    imageAlt: typeof raw.imageAlt === "string" ? raw.imageAlt : "",
    borderStyle: raw.borderStyle as EditorCell["borderStyle"],
  };
}

function safeDocument(value: unknown): EditorDocumentSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<EditorDocumentSnapshot>;
  if (
    !Number.isInteger(raw.size) ||
    (raw.size ?? 0) < 3 ||
    (raw.size ?? 0) > 10 ||
    !raw.cells ||
    typeof raw.cells !== "object" ||
    typeof raw.title !== "string" ||
    typeof raw.description !== "string" ||
    (raw.language !== undefined && typeof raw.language !== "string") ||
    !Array.isArray(raw.tags) ||
    !raw.tags.every((tag) => typeof tag === "string") ||
    !["public", "unlisted", "private"].includes(raw.visibility ?? "") ||
    !["checkmark", "crossout", "highlight"].includes(raw.completionStyle ?? "")
  ) {
    return null;
  }
  const size = raw.size as number;
  const cells: Record<string, EditorCell> = {};
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const key = `${row}:${column}`;
      const cell = safeCell(raw.cells[key], row, column);
      if (!cell) return null;
      cells[key] = cell;
    }
  }
  const boardBackground = safeMedia(raw.boardBackground);
  const cover = safeMedia(raw.cover);
  if (!boardBackground || !cover) return null;
  return {
    size,
    cells,
    title: raw.title,
    description: raw.description,
    language: raw.language ?? "",
    tags: raw.tags,
    visibility: raw.visibility as EditorDocumentSnapshot["visibility"],
    completionStyle: raw.completionStyle as EditorDocumentSnapshot["completionStyle"],
    boardBackground,
    cover,
  };
}

export function readEditorRecovery(
  ownerId: string,
  bingoId?: string | null,
): EditorRecovery | null {
  if (typeof window === "undefined" || !ownerId) return null;
  try {
    const raw = window.localStorage.getItem(recoveryKey(ownerId, bingoId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<EditorRecovery>;
    const document = safeDocument(value.document);
    if (
      value.schema !== RECOVERY_SCHEMA ||
      value.ownerId !== ownerId ||
      (value.bingoId !== null && typeof value.bingoId !== "string") ||
      !Number.isInteger(value.serverVersion) ||
      (value.serverVersion ?? -1) < 0 ||
      typeof value.savedAt !== "string" ||
      !document
    ) {
      window.localStorage.removeItem(recoveryKey(ownerId, bingoId));
      return null;
    }
    return {
      schema: RECOVERY_SCHEMA,
      ownerId,
      bingoId: value.bingoId ?? null,
      serverVersion: value.serverVersion as number,
      savedAt: value.savedAt,
      document,
    };
  } catch {
    return null;
  }
}

export function writeEditorRecovery(ownerId: string, state: EditorState): boolean {
  if (typeof window === "undefined" || !ownerId) return false;
  const document = editorDocumentSnapshot(state);
  const recovery: EditorRecovery = {
    schema: RECOVERY_SCHEMA,
    ownerId,
    bingoId: state.bingoId,
    serverVersion: state.version,
    savedAt: new Date().toISOString(),
    document: {
      ...document,
      boardBackground: { asset: document.boardBackground.asset, previewUrl: null },
      cover: { asset: document.cover.asset, previewUrl: null },
      cells: Object.fromEntries(
        Object.entries(document.cells).map(([key, cell]) => [
          key,
          { ...cell, image: { asset: cell.image.asset, previewUrl: null } },
        ]),
      ),
    },
  };
  try {
    window.localStorage.setItem(recoveryKey(ownerId, state.bingoId), JSON.stringify(recovery));
    return true;
  } catch {
    return false;
  }
}

export function clearEditorRecovery(
  ownerId: string,
  ...bingoIds: (string | null | undefined)[]
): void {
  if (typeof window === "undefined" || !ownerId) return;
  for (const bingoId of new Set(bingoIds)) {
    try {
      window.localStorage.removeItem(recoveryKey(ownerId, bingoId));
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
  }
}

export function clearAllEditorRecovery(): void {
  if (typeof window === "undefined") return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(RECOVERY_PREFIX) || key?.startsWith(LEGACY_RECOVERY_PREFIX)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}
