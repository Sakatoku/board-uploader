import {
  useEffect,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type { Board, BoardItem, Point, Viewport } from "../types";
import { BoardItemView } from "./BoardItemView";
import { clientToWorld, computeOffscreenIndicators } from "../lib/geometry";

interface Props {
  board: Board | null;
  status: string;
  canvasRef: RefObject<HTMLElement>;
  view: Viewport;
  panning: boolean;
  onBackgroundPointerDown: (event: ReactPointerEvent) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFitToContent: () => void;
  onPanToWorldPoint: (worldX: number, worldY: number) => void;
  onDragStart: (item: BoardItem, element: HTMLElement, header: HTMLElement, event: ReactPointerEvent) => void;
  onDropFiles: (files: File[], point: Point) => void;
  onDelete: (itemId: string) => void;
  onRename: (item: BoardItem) => void;
}

// Grid spacing in world units; scaled by zoom for the background dot pattern.
const GRID = 24;

export function BoardCanvas({
  board,
  status,
  canvasRef,
  view,
  panning,
  onBackgroundPointerDown,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFitToContent,
  onPanToWorldPoint,
  onDragStart,
  onDropFiles,
  onDelete,
  onRename,
}: Props) {
  const [dragover, setDragover] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const items = board?.items ?? [];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const update = () => {
      const rect = canvas.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  const offscreenIndicators = computeOffscreenIndicators(items, view, canvasSize);

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    setDragover(true);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragover(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length || !canvasRef.current) return;
    const point = clientToWorld(canvasRef.current, event.clientX, event.clientY, view);
    onDropFiles(files, point);
  };

  const worldTransform = `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`;
  const gridSize = GRID * view.zoom;

  return (
    <main
      ref={canvasRef}
      className={`board-canvas${dragover ? " dragover" : ""}${panning ? " panning" : ""}`}
      style={{
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${view.panX}px ${view.panY}px`,
      }}
      onPointerDown={onBackgroundPointerDown}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragover(false)}
      onDragEnd={() => setDragover(false)}
      onDrop={handleDrop}
    >
      <div className="empty-state-layer">
        <div className={`empty-state${items.length > 0 ? " hidden" : ""}`}>
          <h2>ここにファイルやテキストを置けます</h2>
          <p>ドラッグ&amp;ドロップ、クリップボード貼り付け、または上部のボタンから追加してください。</p>
          <p>背景をドラッグでスクロール、Ctrl+ホイール（またはピンチ）で拡大縮小できます。</p>
        </div>
      </div>

      <div className="board-world" style={{ transform: worldTransform }}>
        {board &&
          items.map((item) => (
            <BoardItemView
              key={item.id}
              boardId={board.id}
              item={item}
              onDragStart={onDragStart}
              onDelete={onDelete}
              onRename={onRename}
            />
          ))}
      </div>

      {offscreenIndicators.map((indicator) => (
        <button
          key={indicator.id}
          type="button"
          className="offscreen-indicator"
          style={{ left: `${indicator.x}px`, top: `${indicator.y}px`, "--angle": `${indicator.angle}rad` } as CSSProperties}
          onClick={() => onPanToWorldPoint(indicator.worldX, indicator.worldY)}
          aria-label="画面外のアイテムへ移動"
          title="画面外のアイテムへ移動"
        >
          ➤
        </button>
      ))}

      <div className="zoom-controls">
        <button
          type="button"
          className="zoom-button"
          onClick={onFitToContent}
          disabled={items.length === 0}
          aria-label="全アイテムを表示"
          title="全アイテムを表示"
        >
          ⛶
        </button>
        <button type="button" className="zoom-button" onClick={onZoomOut} aria-label="縮小">
          −
        </button>
        <button type="button" className="zoom-reset" onClick={onResetView} aria-label="表示をリセット">
          {Math.round(view.zoom * 100)}%
        </button>
        <button type="button" className="zoom-button" onClick={onZoomIn} aria-label="拡大">
          +
        </button>
      </div>

      <p className="status-message">{status}</p>
    </main>
  );
}
