import {
  useEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { BoardItem, DragState, Point, Viewport } from "../types";
import { clientToWorld } from "../lib/geometry";
import { log } from "../lib/log";

interface UseDragArgs {
  canvasRef: RefObject<HTMLElement>;
  /** Live pan/zoom, read imperatively so client→world stays correct mid-drag. */
  viewRef: MutableRefObject<Viewport>;
  /** Updated to the last pointer position over the canvas (default placement). */
  lastPointRef: MutableRefObject<Point>;
  /** Commit the final position (optimistic local update + persist). */
  onCommit: (itemId: string, x: number, y: number) => void;
}

export interface UseDrag {
  startDrag: (item: BoardItem, element: HTMLElement, header: HTMLElement, event: ReactPointerEvent) => void;
}

export function useDrag({ canvasRef, viewRef, lastPointRef, onCommit }: UseDragArgs): UseDrag {
  const dragRef = useRef<DragState | null>(null);

  const startDrag = (
    item: BoardItem,
    element: HTMLElement,
    header: HTMLElement,
    event: ReactPointerEvent,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();

    const origin = clientToWorld(canvas, event.clientX, event.clientY, viewRef.current);
    dragRef.current = {
      itemId: item.id,
      offsetX: origin.x - item.x,
      offsetY: origin.y - item.y,
      element,
      currentX: item.x,
      currentY: item.y,
      moves: 0,
    };

    element.classList.add("dragging");
    try {
      header.setPointerCapture(event.pointerId);
    } catch (error) {
      log("drag capture fail", error instanceof Error ? error.message : String(error), "warn");
    }
    log(
      "pointerdown",
      `id=${item.id.slice(0, 8)} type=${item.type} item=(${item.x},${item.y}) origin=(${origin.x},${origin.y}) offset=(${dragRef.current.offsetX},${dragRef.current.offsetY})`,
    );
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      const target = event.target;
      if (canvas && target instanceof Node && canvas.contains(target)) {
        lastPointRef.current = clientToWorld(canvas, event.clientX, event.clientY, viewRef.current);
      }

      const drag = dragRef.current;
      if (!drag || !canvas) return;

      // Convert to world coordinates so the item tracks the cursor at any zoom.
      const point = clientToWorld(canvas, event.clientX, event.clientY, viewRef.current);
      const x = point.x - drag.offsetX;
      const y = point.y - drag.offsetY;
      drag.currentX = x;
      drag.currentY = y;
      drag.element.style.left = `${x}px`;
      drag.element.style.top = `${y}px`;
      drag.moves += 1;

      if (drag.moves % 8 === 0) {
        log("pointermove", `client=(${event.clientX},${event.clientY}) → world=(${x},${y})`);
      }
    };

    const onPointerUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;

      const { itemId, currentX: x, currentY: y } = drag;
      drag.element.classList.remove("dragging");
      log("pointerup", `id=${itemId.slice(0, 8)} moves=${drag.moves} save=(${x},${y})`, "save");
      onCommit(itemId, x, y);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [canvasRef, viewRef, lastPointRef, onCommit]);

  return { startDrag };
}
