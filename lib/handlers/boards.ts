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
  makeBoard,
  makeFileItem,
  makeNoteItem,
  normalizeTitle,
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

export async function updateItemPosition(
  storage: StorageProvider,
  boardId: string,
  itemId: string,
  input: { x?: unknown; y?: unknown },
): Promise<{ item: BoardItem }> {
  const board = await loadBoard(storage, boardId);
  const item = findItem(board, itemId);
  if (!item) {
    throw notFound("Item not found.");
  }

  const x = toFiniteNumber(input.x, NaN);
  const y = toFiniteNumber(input.y, NaN);
  if (Number.isNaN(x) || Number.isNaN(y)) {
    throw badRequest("x and y must be valid numbers.");
  }

  item.x = x;
  item.y = y;
  item.updatedAt = new Date().toISOString();
  touchBoard(board);
  await storage.metadata.putBoard(board);

  return { item };
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
