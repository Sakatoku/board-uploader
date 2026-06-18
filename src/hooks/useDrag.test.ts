// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { BoardItem, Point, Viewport } from "../types";
import type { UseDrag } from "./useDrag";
import { useDrag } from "./useDrag";

// --- DOM / event helpers ---

function makeCanvas(left = 0, top = 0): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ left, top } as DOMRect);
  document.body.appendChild(el);
  return el;
}

function makeDragElement() {
  const element = document.createElement("div");
  const header = document.createElement("div");
  element.appendChild(header);
  header.setPointerCapture = vi.fn();
  return { element, header };
}

function makeItem(x = 100, y = 200, id = "aaaabbbbccccddddeeeeffff"): BoardItem {
  return {
    id,
    type: "image",
    title: "Test",
    x,
    y,
    fileName: "test.png",
    mimeType: "image/png",
    size: 1024,
    blob: { provider: "mock", key: "k" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  } as BoardItem;
}

function fakePointerEvent(clientX: number, clientY: number, pointerId = 1): ReactPointerEvent {
  return { clientX, clientY, pointerId, preventDefault: vi.fn() } as unknown as ReactPointerEvent;
}

function fireMove(clientX: number, clientY: number, from: Element | Window = window): void {
  from.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY, bubbles: true }));
}

function fireUp(): void {
  window.dispatchEvent(new PointerEvent("pointerup"));
}

// --- suite ---

describe("useDrag", () => {
  let canvas: HTMLElement;
  let onCommit: ReturnType<typeof vi.fn>;
  let viewRef: { current: Viewport };
  let lastPointRef: { current: Point };
  let hook: UseDrag;
  let unmount: () => void;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    canvas = makeCanvas();
    onCommit = vi.fn();
    viewRef = { current: { panX: 0, panY: 0, zoom: 1 } };
    lastPointRef = { current: { x: 0, y: 0 } };

    const canvasRef = { current: canvas } as unknown as React.RefObject<HTMLElement>;
    const rendered = renderHook(() =>
      useDrag({ canvasRef, viewRef, lastPointRef, onCommit }),
    );
    hook = rendered.result.current;
    unmount = rendered.unmount;
  });

  afterEach(() => {
    unmount();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  describe("startDrag", () => {
    it("is a no-op when canvasRef.current is null", () => {
      const nullRef = { current: null } as unknown as React.RefObject<HTMLElement>;
      const { result: r, unmount: u } = renderHook(() =>
        useDrag({ canvasRef: nullRef, viewRef, lastPointRef, onCommit }),
      );
      const { element, header } = makeDragElement();
      const event = fakePointerEvent(300, 400);

      expect(() => r.current.startDrag(makeItem(), element, header, event)).not.toThrow();
      expect(event.preventDefault).not.toHaveBeenCalled();
      u();
    });

    it("calls preventDefault on the event", () => {
      const { element, header } = makeDragElement();
      const event = fakePointerEvent(300, 400);
      hook.startDrag(makeItem(), element, header, event);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it("adds 'dragging' class to the element", () => {
      const { element, header } = makeDragElement();
      hook.startDrag(makeItem(), element, header, fakePointerEvent(300, 400));
      expect(element.classList.contains("dragging")).toBe(true);
    });

    it("captures the pointer on the header with the event's pointerId", () => {
      const { element, header } = makeDragElement();
      hook.startDrag(makeItem(), element, header, fakePointerEvent(300, 400, 7));
      expect(header.setPointerCapture).toHaveBeenCalledWith(7);
    });

    it("handles setPointerCapture errors without aborting the drag", () => {
      const { element, header } = makeDragElement();
      (header.setPointerCapture as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("NotSupportedError");
      });
      expect(() =>
        hook.startDrag(makeItem(), element, header, fakePointerEvent(300, 400)),
      ).not.toThrow();
      expect(element.classList.contains("dragging")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  describe("pointermove", () => {
    it("translates element to (world − offset)", () => {
      // canvas (0,0), zoom 1, item (100,200)
      // startDrag at client (300,400) → world (300,400) → offset (200,200)
      // move   to  client (500,600) → world (500,600) → pos   (300,400)
      const { element, header } = makeDragElement();
      hook.startDrag(makeItem(100, 200), element, header, fakePointerEvent(300, 400));
      fireMove(500, 600);
      expect(element.style.left).toBe("300px");
      expect(element.style.top).toBe("400px");
    });

    it("applies viewport zoom when computing world position", () => {
      // zoom 2, item (100,200)
      // startDrag at client (200,400) → world (100,200) → offset (0,0)
      // move   to  client (400,600) → world (200,300) → pos   (200,300)
      viewRef.current = { panX: 0, panY: 0, zoom: 2 };
      const { element, header } = makeDragElement();
      hook.startDrag(makeItem(100, 200), element, header, fakePointerEvent(200, 400));
      fireMove(400, 600);
      expect(element.style.left).toBe("200px");
      expect(element.style.top).toBe("300px");
    });

    it("applies viewport pan when computing world position", () => {
      // pan (50,30), zoom 1, item (100,200)
      // startDrag at client (300,400) → world (250,370) → offset (150,170)
      // move   to  client (400,500) → world (350,470) → pos   (200,300)
      viewRef.current = { panX: 50, panY: 30, zoom: 1 };
      const { element, header } = makeDragElement();
      hook.startDrag(makeItem(100, 200), element, header, fakePointerEvent(300, 400));
      fireMove(400, 500);
      expect(element.style.left).toBe("200px");
      expect(element.style.top).toBe("300px");
    });

    it("updates lastPointRef when the pointer moves over the canvas", () => {
      fireMove(300, 400, canvas);
      expect(lastPointRef.current).toEqual({ x: 300, y: 400 });
    });

    it("does not update lastPointRef when the pointer is outside the canvas", () => {
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: 300, clientY: 400 }));
      expect(lastPointRef.current).toEqual({ x: 0, y: 0 });
    });

    it("does not throw when pointermove fires with no active drag", () => {
      expect(() => fireMove(300, 400)).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  describe("pointerup", () => {
    it("calls onCommit with item id and final world position", () => {
      const item = makeItem(100, 200);
      const { element, header } = makeDragElement();
      // offset (200,200), move to (500,600) → pos (300,400)
      hook.startDrag(item, element, header, fakePointerEvent(300, 400));
      fireMove(500, 600);
      fireUp();
      expect(onCommit).toHaveBeenCalledWith(item.id, 300, 400);
    });

    it("commits the item's starting position when no pointermove occurred", () => {
      const item = makeItem(100, 200);
      const { element, header } = makeDragElement();
      hook.startDrag(item, element, header, fakePointerEvent(300, 400));
      fireUp();
      expect(onCommit).toHaveBeenCalledWith(item.id, 100, 200);
    });

    it("removes 'dragging' class from the element", () => {
      const { element, header } = makeDragElement();
      hook.startDrag(makeItem(), element, header, fakePointerEvent(300, 400));
      fireUp();
      expect(element.classList.contains("dragging")).toBe(false);
    });

    it("does not call onCommit when no drag is in progress", () => {
      fireUp();
      expect(onCommit).not.toHaveBeenCalled();
    });
  });
});
