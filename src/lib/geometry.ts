import type { Point, Viewport } from "../types";

/**
 * Convert a client (viewport) coordinate into a *world* (board) coordinate
 * under the current pan/zoom. Inverse of the `.board-world` transform:
 *   screen = rect.origin + pan + world * zoom
 *   world  = (screen - rect.origin - pan) / zoom
 *
 * The board is infinite, so the result is intentionally unclamped — items may
 * live at any (including negative) coordinate.
 */
export function clientToWorld(
  canvas: HTMLElement,
  clientX: number,
  clientY: number,
  view: Viewport,
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round((clientX - rect.left - view.panX) / view.zoom),
    y: Math.round((clientY - rect.top - view.panY) / view.zoom),
  };
}
