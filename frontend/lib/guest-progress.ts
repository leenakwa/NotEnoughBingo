import type { PublicId } from "@/lib/api/types";

const prefix = "not-enough-bingo:guest-progress:v1:";

interface GuestProgress {
  bingo_id: PublicId;
  revision_id: PublicId;
  selected_cells: string[];
  updated_at: string;
}

function key(bingoId: PublicId): string {
  return `${prefix}${bingoId}`;
}

export function readGuestProgress(bingoId: PublicId, revisionId: PublicId): GuestProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(bingoId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<GuestProgress>;
    if (
      value.bingo_id !== bingoId ||
      value.revision_id !== revisionId ||
      !Array.isArray(value.selected_cells) ||
      !value.selected_cells.every((cellId) => typeof cellId === "string")
    ) {
      window.localStorage.removeItem(key(bingoId));
      return null;
    }
    return value as GuestProgress;
  } catch {
    window.localStorage.removeItem(key(bingoId));
    return null;
  }
}

export function writeGuestProgress(
  bingoId: PublicId,
  revisionId: PublicId,
  selectedCells: string[],
): boolean {
  if (typeof window === "undefined") return false;
  const value: GuestProgress = {
    bingo_id: bingoId,
    revision_id: revisionId,
    selected_cells: [...selectedCells],
    updated_at: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(key(bingoId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearGuestProgress(bingoId: PublicId): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(key(bingoId));
    return true;
  } catch {
    return false;
  }
}

export function makeIdempotencyKey(): string {
  return crypto.randomUUID();
}
