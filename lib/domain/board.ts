/**
 * Pure domain logic for boards and items.
 *
 * No I/O here — everything is a deterministic function so it can be unit
 * tested without any storage. Handlers compose these with a StorageProvider.
 */

import { randomUUID } from "node:crypto";
import type { Board, BoardItem, BlobRef, FileItem, NoteItem } from "./types";

export const LIMITS = {
  titleMaxLength: 120,
  noteMaxLength: 5000,
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(): string {
  return randomUUID();
}

export function makeBoard(title?: string): Board {
  const ts = nowIso();
  return {
    id: makeId(),
    title: normalizeTitle(title) ?? "Untitled board",
    createdAt: ts,
    updatedAt: ts,
    items: [],
  };
}

export function normalizeTitle(title: unknown): string | null {
  if (typeof title !== "string") {
    return null;
  }
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, LIMITS.titleMaxLength);
}

export function makeNoteItem(input: {
  text: string;
  x: number;
  y: number;
}): NoteItem {
  const ts = nowIso();
  return {
    id: makeId(),
    type: "note",
    title: "Text note",
    text: input.text.slice(0, LIMITS.noteMaxLength),
    x: input.x,
    y: input.y,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function makeFileItem(input: {
  fileName: string;
  mimeType: string;
  size: number;
  blob: BlobRef;
  x: number;
  y: number;
}): FileItem {
  const ts = nowIso();
  const mime = input.mimeType;
  let type: FileItem["type"];
  if (mime.startsWith("image/")) type = "image";
  else if (mime.startsWith("video/")) type = "video";
  else if (mime.startsWith("audio/")) type = "audio";
  else if (mime === "application/pdf") type = "pdf";
  else type = "file";
  return {
    id: makeId(),
    type,
    title: input.fileName,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    blob: input.blob,
    x: input.x,
    y: input.y,
    createdAt: ts,
    updatedAt: ts,
  };
}

export function touchBoard(board: Board): void {
  board.updatedAt = nowIso();
}

export function findItem(board: Board, itemId: string): BoardItem | undefined {
  return board.items.find((item) => item.id === itemId);
}

/** Stable, presentation-ready board ordering (oldest item first). */
export function serializeBoard(board: Board): Board {
  return {
    ...board,
    items: board.items
      .slice()
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
  };
}

/** Coerce a value to a finite number, falling back to a default. */
export function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}
