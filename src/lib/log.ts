import type { DebugEntry, LogLevel } from "../types";

// Module-level debug log store. `log()` can be called from anywhere (api.ts,
// hooks, components) — mirroring the original vanilla global logger — while
// React components subscribe via useSyncExternalStore (see DebugPanel).

const MAX_ENTRIES = 300;

let entries: DebugEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function fmtValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function timestamp(now: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}.${p(
    now.getMilliseconds(),
    3,
  )}`;
}

/** Append a line to the debug log. */
export function log(event: string, data?: unknown, level: LogLevel = "info"): void {
  const time = timestamp(new Date());
  const detail = fmtValue(data);
  const text = `${event}${detail ? ` ${detail}` : ""}`;

  const entry: DebugEntry = { id: nextId++, time, text, level };
  // Replace the array (immutable) so useSyncExternalStore detects the change.
  entries = entries.concat(entry).slice(-MAX_ENTRIES);
  emit();

  const line = `${time} ${text}`;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[board] ${line}`);
}

export function clearLog(): void {
  entries = [];
  emit();
}

export function getEntries(): DebugEntry[] {
  return entries;
}

export function entriesAsText(): string {
  return entries.map((e) => `${e.time} ${e.text}`).join("\n");
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
