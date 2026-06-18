// Reuse the server-side domain model so the client speaks the same language.
// These are type-only imports: nothing from lib/ is bundled into the frontend.
import type {
  Board,
  BoardItem,
  NoteItem,
  FileItem,
  ItemType,
} from "../lib/domain/types";

export type { Board, BoardItem, NoteItem, FileItem, ItemType };

/** Local guard (re-implemented client-side to avoid bundling lib/ runtime). */
export function isFileItem(item: BoardItem): item is FileItem {
  return item.type !== "note";
}

/** A point in board (world) coordinates. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The pan/zoom state of the board.
 *
 * The board is an effectively infinite plane. Items store fixed *world*
 * coordinates; the viewport maps world → screen as
 *   screen = rect.origin + (panX, panY) + world * zoom
 * which the `.board-world` layer applies as `translate(pan) scale(zoom)`.
 */
export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

/** In-flight drag of a board item. */
export interface DragState {
  itemId: string;
  offsetX: number;
  offsetY: number;
  element: HTMLElement;
  currentX: number;
  currentY: number;
  moves: number;
}

export type LogLevel = "info" | "save" | "warn" | "error";

export interface DebugEntry {
  id: number;
  time: string;
  text: string;
  level: LogLevel;
}
