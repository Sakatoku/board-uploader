/**
 * Board + item handlers.
 *
 * Each function is framework-agnostic: it takes a StorageProvider and already-
 * parsed inputs, and returns plain data (or throws HttpError). Adapters deal
 * with HTTP parsing/serialisation. This is what makes the logic unit-testable
 * without spinning up a server.
 */

import type { StorageProvider } from "../storage/provider";
import type { Board, BoardItem, FileItem } from "../domain/types";
import { isFileItem } from "../domain/types";
import {
  findItem,
  LIMITS,
  makeBoard,
  makeFileItem,
  makeNoteItem,
  normalizeTitle,
  removeItem,
  serializeBoard,
  toFiniteNumber,
  touchBoard,
} from "../domain/board";
import { badRequest, notFound } from "../http/errors";
import { logger } from "../logger";

export interface UploadedFile {
  data: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

async function loadBoard(storage: StorageProvider, boardId: string): Promise<Board> {
  const board = await storage.metadata.getBoard(boardId);
  if (!board) {
    throw notFound("Board not found.");
  }
  return board;
}

export async function createBoard(
  storage: StorageProvider,
  input: { title?: unknown },
): Promise<{ board: Board }> {
  const board = makeBoard(normalizeTitle(input.title) ?? undefined);
  await storage.metadata.putBoard(board);
  logger.info("board.create", { boardId: board.id });
  return { board: serializeBoard(board) };
}

export async function getBoard(
  storage: StorageProvider,
  boardId: string,
): Promise<{ board: Board }> {
  const board = await loadBoard(storage, boardId);
  return { board: serializeBoard(board) };
}

export async function addNote(
  storage: StorageProvider,
  boardId: string,
  input: { text?: unknown; x?: unknown; y?: unknown },
): Promise<{ item: BoardItem; board: Board }> {
  const board = await loadBoard(storage, boardId);
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) {
    throw badRequest("Text is required.");
  }

  const note = makeNoteItem({
    text,
    x: toFiniteNumber(input.x, 120),
    y: toFiniteNumber(input.y, 120),
  });

  board.items.push(note);
  touchBoard(board);
  await storage.metadata.putBoard(board);
  logger.info("note.add", { boardId, itemId: note.id });

  return { item: note, board: serializeBoard(board) };
}

export async function addFiles(
  storage: StorageProvider,
  boardId: string,
  files: UploadedFile[],
  input: { x?: unknown; y?: unknown },
): Promise<{ items: FileItem[]; board: Board }> {
  const board = await loadBoard(storage, boardId);
  if (files.length === 0) {
    throw badRequest("At least one file is required.");
  }

  const baseX = toFiniteNumber(input.x, 120);
  const baseY = toFiniteNumber(input.y, 120);

  const newItems: FileItem[] = [];
  for (const [index, file] of files.entries()) {
    const blob = await storage.blobs.put({
      data: file.data,
      fileName: file.originalName,
      contentType: file.mimeType,
    });
    const item = makeFileItem({
      fileName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      blob,
      x: baseX + index * 28,
      y: baseY + index * 28,
    });
    newItems.push(item);
    logger.info("file.upload", {
      boardId,
      itemId: item.id,
      mimeType: item.mimeType,
      size: item.size,
    });
  }

  board.items.push(...newItems);
  touchBoard(board);
  await storage.metadata.putBoard(board);

  return { items: newItems, board: serializeBoard(board) };
}

export interface AttachFileInput {
  url?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  x?: unknown;
  y?: unknown;
}

/**
 * Attach files the browser already uploaded directly to the storage backend
 * (see ClientUploadStore). The client sends each resulting blob URL plus its
 * metadata; we validate and record them as items. This is the read side of the
 * direct-upload path that lifts the ~4.5MB serverless body cap.
 */
export async function attachFiles(
  storage: StorageProvider,
  boardId: string,
  files: AttachFileInput[],
): Promise<{ items: FileItem[]; board: Board }> {
  const board = await loadBoard(storage, boardId);
  if (!Array.isArray(files) || files.length === 0) {
    throw badRequest("At least one uploaded file is required.");
  }

  const newItems: FileItem[] = files.map((file) => {
    const url = typeof file.url === "string" ? file.url : "";
    // Only accept https URLs on the provider's own host: a blob ref is a
    // capability (anyone with the function can serve it), so don't let a client
    // smuggle in an arbitrary external URL.
    if (!isAllowedBlobUrl(url)) {
      throw badRequest("A valid uploaded file URL is required.");
    }
    const fileName = typeof file.fileName === "string" && file.fileName ? file.fileName : "file";
    const mimeType =
      typeof file.mimeType === "string" && file.mimeType ? file.mimeType : "application/octet-stream";
    const size = toFiniteNumber(file.size, 0);

    return makeFileItem({
      fileName,
      mimeType,
      size,
      blob: { provider: storage.name, key: url },
      x: toFiniteNumber(file.x, 120),
      y: toFiniteNumber(file.y, 120),
    });
  });

  board.items.push(...newItems);
  touchBoard(board);
  await storage.metadata.putBoard(board);
  for (const item of newItems) {
    logger.info("file.attach", { boardId, itemId: item.id, mimeType: item.mimeType, size: item.size });
  }

  // Best-effort: clean up GC markers for the blobs we just attached.
  // If onUploadCompleted hasn't fired yet, deletePendingMarker is a no-op.
  if (storage.gc) {
    const gc = storage.gc;
    void Promise.allSettled(
      newItems.map((item) => gc.deletePendingMarker(item.blob.key)),
    ).then((results) => {
      for (const r of results) {
        if (r.status === "rejected") {
          logger.warn("gc.marker.delete_fail", { error: r.reason });
        }
      }
    });
  }

  return { items: newItems, board: serializeBoard(board) };
}

/** Accept only https URLs pointing at the Vercel Blob public host. */
function isAllowedBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/**
 * Partial update of an item: position (x and y together), title, note text,
 * or any combination in one PATCH. At least one field must be present.
 */
export async function updateItem(
  storage: StorageProvider,
  boardId: string,
  itemId: string,
  input: { x?: unknown; y?: unknown; title?: unknown; text?: unknown },
): Promise<{ item: BoardItem }> {
  const board = await loadBoard(storage, boardId);
  const item = findItem(board, itemId);
  if (!item) {
    throw notFound("Item not found.");
  }

  const hasPosition = input.x !== undefined || input.y !== undefined;
  const hasTitle = input.title !== undefined;
  const hasText = input.text !== undefined;
  if (!hasPosition && !hasTitle && !hasText) {
    throw badRequest("Nothing to update.");
  }

  if (hasPosition) {
    const x = toFiniteNumber(input.x, NaN);
    const y = toFiniteNumber(input.y, NaN);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      throw badRequest("x and y must be valid numbers.");
    }
    item.x = x;
    item.y = y;
  }

  if (hasTitle) {
    const title = normalizeTitle(input.title);
    if (!title) {
      throw badRequest("Title is required.");
    }
    item.title = title;
  }

  if (hasText) {
    if (item.type !== "note") {
      throw badRequest("Only notes have editable text.");
    }
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text) {
      throw badRequest("Text is required.");
    }
    item.text = text.slice(0, LIMITS.noteMaxLength);
  }

  item.updatedAt = new Date().toISOString();
  touchBoard(board);
  await storage.metadata.putBoard(board);
  if (hasTitle) {
    logger.info("item.rename", { boardId, itemId, title: item.title });
  }
  if (hasText) {
    logger.info("item.text_edit", { boardId, itemId });
  }

  return { item };
}

export async function deleteItem(
  storage: StorageProvider,
  boardId: string,
  itemId: string,
): Promise<{ board: Board }> {
  const board = await loadBoard(storage, boardId);
  const item = findItem(board, itemId);
  if (!item) {
    throw notFound("Item not found.");
  }

  removeItem(board, itemId);
  touchBoard(board);
  await storage.metadata.putBoard(board);
  logger.info("item.delete", { boardId, itemId, type: item.type });

  if (isFileItem(item)) {
    // Best-effort: GC is the safety net if this fails.
    await storage.blobs.delete(item.blob).catch((err: unknown) => {
      logger.warn("item.delete.blob_fail", { boardId, itemId, error: err });
    });
  }

  return { board: serializeBoard(board) };
}

export interface ResolvedFile {
  item: FileItem;
  directUrl: string | null;
}

/** Resolve a file item for serving (used by content + download routes). */
export async function resolveFile(
  storage: StorageProvider,
  boardId: string,
  itemId: string,
): Promise<ResolvedFile> {
  const board = await loadBoard(storage, boardId);
  const item = findItem(board, itemId);
  if (!item || !isFileItem(item)) {
    throw notFound("File not found.");
  }
  const directUrl = await storage.blobs.directUrl(item.blob);
  return { item, directUrl };
}
