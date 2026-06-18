import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Viewport } from "../types";
import { zoomToward } from "../lib/geometry";
import { log } from "../lib/log";

const ZOOM_STEP = 1.2;

interface UseViewportArgs {
  canvasRef: RefObject<HTMLElement>;
  /** Kept in sync with `view` so imperative handlers (drag) read live state. */
  viewRef: MutableRefObject<Viewport>;
}

export interface UseViewport {
  view: Viewport;
  /** Begin a background pan (pointer down on empty canvas, not on an item). */
  onBackgroundPointerDown: (event: ReactPointerEvent) => void;
  panning: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

/** Live pinch/pan gesture against a stable set of active pointers. */
interface Gesture {
  kind: "pan" | "pinch";
  /** screen anchor + pan at gesture start (pan). */
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
  /** pinch only */
  startDist: number;
  startZoom: number;
}

export function useViewport({ canvasRef, viewRef }: UseViewportArgs): UseViewport {
  const [view, setViewState] = useState<Viewport>(viewRef.current);
  const [panning, setPanning] = useState(false);

  const setView = useCallback(
    (next: Viewport) => {
      viewRef.current = next;
      setViewState(next);
    },
    [viewRef],
  );

  // Active pointers (id -> last screen position) and the current gesture.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);

  /** Zoom toward a screen anchor so the world point under it stays put. */
  const zoomAround = useCallback(
    (nextZoomRaw: number, anchorClientX: number, anchorClientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const current = viewRef.current;
      const next = zoomToward(current, nextZoomRaw, anchorClientX - rect.left, anchorClientY - rect.top);
      if (next !== current) {
        setView(next);
      }
    },
    [canvasRef, viewRef, setView],
  );

  /** Zoom by a fixed factor around the canvas centre (button controls). */
  const zoomByCenter = useCallback(
    (factor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoomAround(viewRef.current.zoom * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [canvasRef, viewRef, zoomAround],
  );

  const zoomIn = useCallback(() => zoomByCenter(ZOOM_STEP), [zoomByCenter]);
  const zoomOut = useCallback(() => zoomByCenter(1 / ZOOM_STEP), [zoomByCenter]);
  const reset = useCallback(() => setView({ panX: 0, panY: 0, zoom: 1 }), [setView]);

  // Wheel: ctrl/cmd (or trackpad pinch) zooms toward the cursor; otherwise pan.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.0015);
        zoomAround(viewRef.current.zoom * factor, event.clientX, event.clientY);
        return;
      }
      const v = viewRef.current;
      setView({ ...v, panX: v.panX - event.deltaX, panY: v.panY - event.deltaY });
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, viewRef, setView, zoomAround]);

  const onBackgroundPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      // Don't intercept clicks on buttons, links, or other interactive elements inside the canvas.
      if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }

      const v = viewRef.current;
      if (pointers.current.size === 1) {
        gesture.current = {
          kind: "pan",
          startX: event.clientX,
          startY: event.clientY,
          startPanX: v.panX,
          startPanY: v.panY,
          startDist: 0,
          startZoom: v.zoom,
        };
        setPanning(true);
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current = {
          kind: "pinch",
          startX: (a.x + b.x) / 2,
          startY: (a.y + b.y) / 2,
          startPanX: v.panX,
          startPanY: v.panY,
          startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          startZoom: v.zoom,
        };
        setPanning(false);
      }
    },
    [canvasRef, viewRef],
  );

  // Window-level move/up so a gesture survives the pointer leaving the canvas.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const g = gesture.current;
      if (!g) return;

      if (g.kind === "pan") {
        const v = viewRef.current;
        setView({
          ...v,
          panX: g.startPanX + (event.clientX - g.startX),
          panY: g.startPanY + (event.clientY - g.startY),
        });
        return;
      }

      // pinch: scale by finger-distance ratio, anchored at the live midpoint.
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAround((g.startZoom * dist) / g.startDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
    };

    const endPointer = (event: PointerEvent) => {
      if (!pointers.current.delete(event.pointerId)) return;
      if (pointers.current.size === 0) {
        gesture.current = null;
        setPanning(false);
      } else if (pointers.current.size === 1) {
        // Dropped from pinch to a single finger: continue as a pan.
        const [only] = [...pointers.current.values()];
        const v = viewRef.current;
        gesture.current = {
          kind: "pan",
          startX: only.x,
          startY: only.y,
          startPanX: v.panX,
          startPanY: v.panY,
          startDist: 0,
          startZoom: v.zoom,
        };
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endPointer);
    window.addEventListener("pointercancel", endPointer);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endPointer);
      window.removeEventListener("pointercancel", endPointer);
    };
  }, [viewRef, setView, zoomAround]);

  useEffect(() => {
    log("viewport", `pan=(${Math.round(view.panX)},${Math.round(view.panY)}) zoom=${view.zoom.toFixed(2)}`);
  }, [view]);

  return { view, onBackgroundPointerDown, panning, zoomIn, zoomOut, reset };
}
