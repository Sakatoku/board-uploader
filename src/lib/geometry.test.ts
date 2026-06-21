import { describe, it, expect } from "vitest";
import type { Viewport } from "../types";
import {
  clampZoom,
  zoomToward,
  clientToWorld,
  fitBounds,
  computeOffscreenIndicators,
  MIN_ZOOM,
  MAX_ZOOM,
} from "./geometry";

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

describe("fitBounds", () => {
  it("centers the bounding box and picks the limiting axis's zoom", () => {
    const bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
    const canvasSize = { width: 1000, height: 500 };
    const result = fitBounds(bounds, canvasSize, 0);

    // width ratio = 1000/200 = 5, height ratio = 500/100 = 5 -> tie, clamp to MAX_ZOOM
    expect(result?.zoom).toBe(MAX_ZOOM);
    // content center (100,50) must land on the canvas center (500,250)
    expect(result?.panX).toBeCloseTo(500 - 100 * MAX_ZOOM, 6);
    expect(result?.panY).toBeCloseTo(250 - 50 * MAX_ZOOM, 6);
  });

  it("shrinks zoom to fit large content within padding", () => {
    const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 1000 };
    const canvasSize = { width: 1000, height: 600 };
    const result = fitBounds(bounds, canvasSize, 50);

    // avail = 900x500; ratios = 0.45, 0.5 -> zoom = 0.45
    expect(result?.zoom).toBeCloseTo(0.45, 6);
  });

  it("clamps zoom to the allowed range", () => {
    const tiny = fitBounds({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, { width: 1000, height: 1000 });
    expect(tiny?.zoom).toBe(MAX_ZOOM);
  });

  it("returns null for a zero-area bounding box", () => {
    expect(fitBounds({ minX: 10, minY: 10, maxX: 10, maxY: 50 }, { width: 800, height: 600 })).toBeNull();
    expect(fitBounds({ minX: 10, minY: 10, maxX: 50, maxY: 10 }, { width: 800, height: 600 })).toBeNull();
  });
});

describe("computeOffscreenIndicators", () => {
  const view: Viewport = { panX: 0, panY: 0, zoom: 1 };
  const canvasSize = { width: 800, height: 600 };

  it("skips items inside the visible canvas", () => {
    const result = computeOffscreenIndicators([{ id: "a", x: 400, y: 300 }], view, canvasSize);
    expect(result).toEqual([]);
  });

  it("clamps an off-screen item to the right edge and points right", () => {
    const result = computeOffscreenIndicators([{ id: "a", x: 2000, y: 300 }], view, canvasSize);
    expect(result).toHaveLength(1);
    const [indicator] = result;
    expect(indicator.id).toBe("a");
    expect(indicator.worldX).toBe(2000);
    expect(indicator.worldY).toBe(300);
    expect(indicator.angle).toBeCloseTo(0, 6); // straight right from center
    expect(indicator.x).toBeLessThanOrEqual(canvasSize.width);
    expect(indicator.x).toBeGreaterThan(canvasSize.width / 2);
    expect(indicator.y).toBeCloseTo(canvasSize.height / 2, 6); // dy was 0
  });

  it("clamps a diagonally off-screen item within the padded rectangle", () => {
    const result = computeOffscreenIndicators([{ id: "a", x: -5000, y: -5000 }], view, canvasSize, 20);
    expect(result).toHaveLength(1);
    const [indicator] = result;
    // Should land on (or inside) the padded box around the canvas center.
    expect(indicator.x).toBeGreaterThanOrEqual(0);
    expect(indicator.y).toBeGreaterThanOrEqual(0);
    expect(indicator.x).toBeLessThan(canvasSize.width / 2);
    expect(indicator.y).toBeLessThan(canvasSize.height / 2);
  });

  it("returns nothing when the canvas size hasn't been measured yet", () => {
    const result = computeOffscreenIndicators([{ id: "a", x: 9999, y: 9999 }], view, { width: 0, height: 0 });
    expect(result).toEqual([]);
  });

  it("only reports items that are actually off-screen", () => {
    const result = computeOffscreenIndicators(
      [
        { id: "visible", x: 10, y: 10 },
        { id: "offscreen", x: -500, y: -500 },
      ],
      view,
      canvasSize,
    );
    expect(result.map((i) => i.id)).toEqual(["offscreen"]);
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
