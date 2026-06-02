/**
 * Core domain model.
 *
 * These types are storage-agnostic on purpose: handlers and the React client
 * speak in terms of Boards and Items, never in terms of pCloud paths. The only
 * storage-aware field is `BlobRef`, which is an opaque pointer the BlobStore
 * knows how to resolve.
 */

export type ItemType = "note" | "image" | "file";

/** Opaque pointer to a stored binary. `provider` lets us migrate stores later. */
export interface BlobRef {
  provider: string;
  /** Provider-specific key (e.g. a pCloud path or fileid). */
  key: string;
}

interface BaseItem {
  id: string;
  type: ItemType;
  title: string;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem extends BaseItem {
  type: "note";
  text: string;
}

export interface FileItem extends BaseItem {
  type: "image" | "file";
  fileName: string;
  mimeType: string;
  size: number;
  /** Where the binary lives. Resolved lazily by the BlobStore. */
  blob: BlobRef;
}

export type BoardItem = NoteItem | FileItem;

export interface Board {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  items: BoardItem[];
}

export function isFileItem(item: BoardItem): item is FileItem {
  return item.type === "image" || item.type === "file";
}
