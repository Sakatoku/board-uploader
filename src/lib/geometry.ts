import type { Point, Viewport } from "../types";

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

/** Clamp a zoom factor to the allowed range. */
export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return Math.min(max, Math.max(min, zoom));
}

/**
 * Zoom toward a *canvas-relative* anchor (e.g. cursor or pinch midpoint) so the
 * world point under the anchor stays fixed on screen. Returns a new viewport
 * with the zoom clamped; returns the input unchanged when the clamp is a no-op.
 *
 * Anchor coords are relative to the canvas origin (clientX - rect.left, …),
 * which keeps this pure and trivially testable without a DOM.
 */
export function zoomToward(
  view: Viewport,
  nextZoomRaw: number,
  anchorX: number,
  anchorY: number,
): Viewport {
  const zoom = clampZoom(nextZoomRaw);
  if (zoom === view.zoom) {
    return view;
  }
  // World point under the anchor must map to the same screen point after zoom.
  const worldX = (anchorX - view.panX) / view.zoom;
  const worldY = (anchorY - view.panY) / view.zoom;
  return {
    zoom,
    panX: anchorX - worldX * zoom,
    panY: anchorY - worldY * zoom,
  };
}

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
