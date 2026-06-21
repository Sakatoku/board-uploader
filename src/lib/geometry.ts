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
 * Compute a viewport that frames a world-space bounding box within a canvas
 * of the given size, centered, with `padding` screen px of margin. Returns
 * null when the box has no area (nothing to fit, e.g. an empty board).
 */
export function fitBounds(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  canvasSize: { width: number; height: number },
  padding = 48,
): Viewport | null {
  const boundsWidth = bounds.maxX - bounds.minX;
  const boundsHeight = bounds.maxY - bounds.minY;
  if (boundsWidth <= 0 || boundsHeight <= 0) {
    return null;
  }

  const availWidth = Math.max(canvasSize.width - padding * 2, 1);
  const availHeight = Math.max(canvasSize.height - padding * 2, 1);
  const zoom = clampZoom(Math.min(availWidth / boundsWidth, availHeight / boundsHeight));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    zoom,
    panX: canvasSize.width / 2 - centerX * zoom,
    panY: canvasSize.height / 2 - centerY * zoom,
  };
}

export interface OffscreenIndicator {
  id: string;
  /** Canvas-relative screen position to render the indicator at, clamped to the edge. */
  x: number;
  y: number;
  /** Radians; rotate an arrow glyph by this to point toward the item. */
  angle: number;
  /** The item's own world coordinates, for panning to it on click. */
  worldX: number;
  worldY: number;
}

/**
 * Find items whose anchor point (top-left, not the full rendered card) falls
 * outside the visible canvas, and compute where to draw an edge arrow
 * pointing toward each — the classic "radial clamp" off-screen indicator.
 * Item width/height aren't accounted for, so this is an approximation: a
 * card that's mostly off-screen but whose corner still pokes in won't get an
 * indicator, and vice versa near the edge. Good enough for "don't get lost."
 */
export function computeOffscreenIndicators(
  items: { id: string; x: number; y: number }[],
  view: Viewport,
  canvasSize: { width: number; height: number },
  padding = 28,
): OffscreenIndicator[] {
  const { width, height } = canvasSize;
  if (width <= 0 || height <= 0) {
    return [];
  }
  const centerX = width / 2;
  const centerY = height / 2;
  const halfW = Math.max(centerX - padding, 1);
  const halfH = Math.max(centerY - padding, 1);

  const indicators: OffscreenIndicator[] = [];
  for (const item of items) {
    const screenX = view.panX + item.x * view.zoom;
    const screenY = view.panY + item.y * view.zoom;
    if (screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height) {
      continue;
    }
    const dx = screenX - centerX;
    const dy = screenY - centerY;
    if (dx === 0 && dy === 0) {
      continue;
    }
    const scale = Math.min(
      dx !== 0 ? halfW / Math.abs(dx) : Infinity,
      dy !== 0 ? halfH / Math.abs(dy) : Infinity,
    );
    indicators.push({
      id: item.id,
      x: centerX + dx * scale,
      y: centerY + dy * scale,
      angle: Math.atan2(dy, dx),
      worldX: item.x,
      worldY: item.y,
    });
  }
  return indicators;
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
