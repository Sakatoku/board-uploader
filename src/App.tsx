import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Viewport } from "./types";
import { useBoard } from "./hooks/useBoard";
import { useDrag } from "./hooks/useDrag";
import { useViewport } from "./hooks/useViewport";
import { Header } from "./components/Header";
import { BoardCanvas } from "./components/BoardCanvas";
import { DebugPanel } from "./components/DebugPanel";
import { log } from "./lib/log";

export default function App() {
  const { board, status, setStatus, refresh, addNote, addFiles, moveItem } = useBoard();
  const canvasRef = useRef<HTMLElement>(null);
  const lastPointRef = useRef<Point>({ x: 60, y: 60 });
  const viewRef = useRef<Viewport>({ panX: 0, panY: 0, zoom: 1 });
  const [debugOpen, setDebugOpen] = useState(false);

  const { view, panning, onBackgroundPointerDown, zoomIn, zoomOut, reset } = useViewport({
    canvasRef,
    viewRef,
  });
  const { startDrag } = useDrag({ canvasRef, viewRef, lastPointRef, onCommit: moveItem });

  const uploadAt = useCallback(
    async (files: File[], point: Point) => {
      try {
        setStatus("ファイルを追加しています...");
        await addFiles(files, point);
        setStatus(`${files.length} 件のファイルを追加しました。`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [addFiles, setStatus],
  );

  const handleFiles = useCallback(
    (files: File[]) => uploadAt(files, lastPointRef.current),
    [uploadAt],
  );

  const handleAddNote = useCallback(async () => {
    const text = window.prompt("追加したいテキストを入力してください。");
    if (!text || !text.trim()) return;
    try {
      setStatus("テキストを追加しています...");
      await addNote(text.trim(), lastPointRef.current);
      setStatus("テキストを追加しました。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [addNote, setStatus]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("共有 URL をコピーしました。");
    } catch {
      setStatus(`URL をコピーできませんでした: ${window.location.href}`);
    }
  }, [setStatus]);

  // Initial load.
  useEffect(() => {
    log("load", `path=${window.location.pathname}`);
    refresh().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      log("refreshBoard failed", message, "error");
    });
  }, [refresh, setStatus]);

  // Global error breadcrumbs.
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      log("window.error", `${event.message} @ ${event.filename}:${event.lineno}`, "error");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { message?: string } | undefined;
      log("unhandledrejection", String(reason?.message ?? event.reason), "error");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Clipboard paste: images become uploads, text becomes a note.
  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      const clipboardItems = Array.from(event.clipboardData?.items ?? []);
      if (!clipboardItems.length) return;

      const imageFiles = clipboardItems
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));

      if (imageFiles.length) {
        event.preventDefault();
        try {
          setStatus("貼り付け画像を追加しています...");
          await addFiles(imageFiles, lastPointRef.current);
          setStatus(`${imageFiles.length} 件の画像を追加しました。`);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
        return;
      }

      const text = event.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;
      event.preventDefault();
      try {
        setStatus("貼り付けテキストを追加しています...");
        await addNote(text, lastPointRef.current);
        setStatus("テキストを追加しました。");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles, addNote, setStatus]);

  return (
    <div className="app-shell">
      <Header
        onFiles={handleFiles}
        onAddNote={handleAddNote}
        onToggleDebug={() => setDebugOpen((open) => !open)}
        debugOpen={debugOpen}
        onCopyLink={handleCopyLink}
      />
      <BoardCanvas
        board={board}
        status={status}
        canvasRef={canvasRef}
        view={view}
        panning={panning}
        onBackgroundPointerDown={onBackgroundPointerDown}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetView={reset}
        onDragStart={startDrag}
        onDropFiles={uploadAt}
      />
      <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} onCopyStatus={setStatus} />
    </div>
  );
}
