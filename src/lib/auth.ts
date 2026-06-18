// Stage-1 write key: a shared passphrase the writer enters once and we keep in
// localStorage, sent as X-API-Key on writes (and as clientPayload for direct
// uploads). Reads need no key. Wrapped in try/catch so a blocked localStorage
// (private mode) degrades to "no key" rather than throwing.

const STORAGE_KEY = "board-uploader:write-key";

export function getWriteKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setWriteKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      localStorage.setItem(STORAGE_KEY, trimmed);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore — storage unavailable */
  }
}

export function hasWriteKey(): boolean {
  return getWriteKey().length > 0;
}
