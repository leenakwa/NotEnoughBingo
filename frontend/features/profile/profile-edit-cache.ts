interface ProfileEdits {
  username?: string;
  displayName?: string;
  bio?: string;
  preferredLanguages?: string[];
}

// Keep unsaved profile edits across client-side Back/Forward navigation.
// Passwords, email and account settings never enter this in-memory cache.
const editsByAccount = new Map<string, ProfileEdits>();

export function readProfileEdits(accountId: string): ProfileEdits | undefined {
  return editsByAccount.get(accountId);
}

export function rememberProfileEdits(accountId: string, edits: ProfileEdits): void {
  if (Object.keys(edits).length) editsByAccount.set(accountId, edits);
  else editsByAccount.delete(accountId);
}

export function clearProfileEdits(): void {
  editsByAccount.clear();
}
