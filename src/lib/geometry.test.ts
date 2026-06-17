import { describe, it, expect } from "vitest";
import type { Viewport } from "../types";
import { clampZoom, zoomToward, clientToWorld, MIN_ZOOM, MAX_ZOOM } from "./geometry";

/** Minimal canvas stub: clientToWorld only reads rect.left / rect.top. */
function canvasAt(left: number, top: number): HTMLElement {
  return { getBoundingClientRect: () => ({ left, top }) } as unknown as HTMLElement;
}

describe("clampZoom", () => {
  it("passes through values in range", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it("clamps to the default bounds", () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-5)).toBe(MIN_ZOOM);
  });

  it("honours custom bounds", () => {
    expect(clampZoom(5, 1, 3)).toBe(3);
    expect(clampZoom(0.5, 1, 3)).toBe(1);
  });
});

describe("zoomToward", () => {
  it("keeps the world point under the anchor fixed on screen", () => {
    const view: Viewport = { panX: 30, panY: -20, zoom: 1.5 };
    const [ax, ay] = [200, 140];
    const next = zoomToward(view, 3, ax, ay);

    // The world point under the anchor before zoom...
    const worldX = (ax - view.panX) / view.zoom;
    const worldY = (ay - view.panY) / view.zoom;
    // ...must still map to the same screen anchor after zoom.
    expect(next.panX + worldX * next.zoom).toBeCloseTo(ax, 6);
    expect(next.panY + worldY * next.zoom).toBeCloseTo(ay, 6);
    expect(next.zoom).toBe(3);
  });

  it("does not move the origin when anchored at (0,0) from a reset view", () => {
    const next = zoomToward({ panX: 0, panY: 0, zoom: 1 }, 2, 0, 0);
    expect(next).toEqual({ panX: 0, panY: 0, zoom: 2 });
  });

  it("clamps the target zoom", () => {
    expect(zoomToward({ panX: 0, panY: 0, zoom: 1 }, 999, 50, 50).zoom).toBe(MAX_ZOOM);
    expect(zoomToward({ panX: 0, panY: 0, zoom: 1 }, 0.001, 50, 50).zoom).toBe(MIN_ZOOM);
  });

  it("returns the same viewport (no-op) when the clamp can't change zoom", () => {
    const atMax: Viewport = { panX: 10, panY: 10, zoom: MAX_ZOOM };
    expect(zoomToward(atMax, 999, 100, 100)).toBe(atMax);
  });

  it("composes back to identity when zooming in then out about the same anchor", () => {
    const view: Viewport = { panX: 12, panY: 8, zoom: 1 };
    const zoomedIn = zoomToward(view, 2, 320, 180);
    const back = zoomToward(zoomedIn, 1, 320, 180);
    expect(back.zoom).toBe(1);
    expect(back.panX).toBeCloseTo(view.panX, 6);
    expect(back.panY).toBeCloseTo(view.panY, 6);
  });
});

describe("clientToWorld", () => {
  it("inverts the pan/zoom transform", () => {
    const canvas = canvasAt(100, 50);
    // client (300, 250) with rect (100,50), pan (40,20), zoom 2
    // world = ((300-100-40)/2, (250-50-20)/2) = (80, 90)
    const world = clientToWorld(canvas, 300, 250, { panX: 40, panY: 20, zoom: 2 });
    expect(world).toEqual({ x: 80, y: 90 });
  });

  it("rounds to integer world coordinates", () => {
    const canvas = canvasAt(0, 0);
    const world = clientToWorld(canvas, 101, 0, { panX: 0, panY: 0, zoom: 3 });
    expect(world.x).toBe(Math.round(101 / 3)); // 34
  });

  it("round-trips a world point through the zoom anchor invariant", () => {
    const canvas = canvasAt(0, 0);
    const view: Viewport = { panX: 25, panY: -15, zoom: 1.25 };
    // Screen position of world point (200,120): pan + world*zoom
    const screenX = view.panX + 200 * view.zoom;
    const screenY = view.panY + 120 * view.zoom;
    expect(clientToWorld(canvas, screenX, screenY, view)).toEqual({ x: 200, y: 120 });
  });
});
