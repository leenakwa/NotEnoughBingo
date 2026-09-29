import type { PublicId } from "@/lib/api/types";

const prefix = "not-enough-bingo:progress-recovery:v1:";

interface ProgressRecovery {
  revisionId: PublicId;
  selectedCells: string[];
}

function key(accountId: PublicId, bingoId: PublicId): string {
  return `${prefix}${accountId}:${bingoId}`;
}

export function readProgressRecovery(
  accountId: PublicId,
  bingoId: PublicId,
  revisionId: PublicId,
): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(accountId, bingoId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ProgressRecovery>;
    if (
      value.revisionId !== revisionId ||
      !Array.isArray(value.selectedCells) ||
      !value.selectedCells.every((cellId) => typeof cellId === "string")
    ) {
      window.sessionStorage.removeItem(key(accountId, bingoId));
      return null;
    }
    return value.selectedCells;
  } catch {
    window.sessionStorage.removeItem(key(accountId, bingoId));
    return null;
  }
}

export function writeProgressRecovery(
  accountId: PublicId,
  bingoId: PublicId,
  revisionId: PublicId,
  selectedCells: string[],
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(
      key(accountId, bingoId),
      JSON.stringify({ revisionId, selectedCells } satisfies ProgressRecovery),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearProgressRecovery(accountId: PublicId, bingoId: PublicId): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key(accountId, bingoId));
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

export function clearAllProgressRecovery(): void {
  if (typeof window === "undefined") return;
  try {
    const keys = Array.from({ length: window.sessionStorage.length }, (_, index) =>
      window.sessionStorage.key(index),
    );
    for (const item of keys) {
      if (item?.startsWith(prefix)) window.sessionStorage.removeItem(item);
    }
  } catch {
    // Storage may be unavailable in private browsing.
  }
}
