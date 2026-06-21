// User-local UI preferences (not board data), persisted the same way as the
// write key: localStorage, wrapped in try/catch for private-mode safety.

const PLACE_AT_CENTER_KEY = "board-uploader:place-at-viewport-center";

/** When true, new items are placed at the current viewport center instead of
 * the last known cursor position. */
export function getPlaceAtViewportCenter(): boolean {
  try {
    return localStorage.getItem(PLACE_AT_CENTER_KEY) === "true";
  } catch {
    return false;
  }
}

export function setPlaceAtViewportCenter(value: boolean): void {
  try {
    localStorage.setItem(PLACE_AT_CENTER_KEY, value ? "true" : "false");
  } catch {
    /* ignore — storage unavailable */
  }
}
