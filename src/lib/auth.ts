// Stage-1 write key: a shared passphrase the writer enters once and we keep
// client-side, sent as X-API-Key on writes (and as clientPayload for direct
// uploads). Reads need no key.
//
// Storage fallback chain: localStorage -> sessionStorage -> in-memory. Some
// environments (private browsing, locked-down webviews) block persistent
// storage entirely; the in-memory tier keeps the key usable for the current
// page lifetime so a freshly-scanned QR code (see below) still works there,
// degrading to "re-scan after reload" rather than failing outright.
//
// Stage-2 (lightweight): instead of typing the key on every new device, an
// already-authorized device can render a QR code / link carrying the key in
// a URL fragment (#wk=...). Fragments are never sent in HTTP requests, so
// this never leaks the key into server access logs. See buildKeyTransferUrl
// and consumeKeyFromLocation.

const STORAGE_KEY = "board-uploader:write-key";
const HASH_PREFIX = "#wk=";

let memoryKey = "";

function readStorage(storage: Storage): string | null {
  try {
    return storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, value: string | null): void {
  try {
    if (value) {
      storage.setItem(STORAGE_KEY, value);
    } else {
      storage.removeItem(STORAGE_KEY);
    }
  } catch {
    /* ignore — storage unavailable */
  }
}

export function getWriteKey(): string {
  return readStorage(localStorage) ?? readStorage(sessionStorage) ?? memoryKey;
}

export function setWriteKey(key: string): void {
  const trimmed = key.trim();
  const value = trimmed || null;
  memoryKey = trimmed;
  writeStorage(localStorage, value);
  writeStorage(sessionStorage, value);
}

export function hasWriteKey(): boolean {
  return getWriteKey().length > 0;
}

/** Build a link that hands the currently-stored write key to whoever opens it. */
export function buildKeyTransferUrl(): string {
  const url = new URL(window.location.href);
  url.hash = `wk=${encodeURIComponent(getWriteKey())}`;
  return url.toString();
}

/**
 * Pick up a write key delivered via #wk=... (e.g. a scanned "add device" QR
 * code) and scrub it from the visible URL/history immediately after, so it
 * doesn't linger in the address bar or browser history.
 */
export function consumeKeyFromLocation(): void {
  const hash = window.location.hash;
  if (!hash.startsWith(HASH_PREFIX)) return;
  const key = decodeURIComponent(hash.slice(HASH_PREFIX.length));
  setWriteKey(key);
  history.replaceState(null, "", window.location.pathname + window.location.search);
}
