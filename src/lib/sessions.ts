import type { Credential } from '../types/game';

export interface SavedTable extends Credential {
  name: string;
  lastVisited: string;
}
const storageKey = 'tavern:tables:v1';
export function savedTables(): SavedTable[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is SavedTable =>
        !!entry &&
        typeof entry.roomCode === 'string' &&
        typeof entry.token === 'string' &&
        typeof entry.memberId === 'string',
    );
  } catch {
    return [];
  }
}
export function rememberTable(credential: Credential, name: string) {
  const entries = savedTables().filter((entry) => entry.roomCode !== credential.roomCode);
  entries.unshift({ ...credential, name, lastVisited: new Date().toISOString() });
  localStorage.setItem(storageKey, JSON.stringify(entries.slice(0, 20)));
}
export function sessionFor(code: string): SavedTable | undefined {
  return savedTables().find((entry) => entry.roomCode === code.toUpperCase());
}
