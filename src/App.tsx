import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Viewport } from "./types";
import { useBoard } from "./hooks/useBoard";
import { useDrag } from "./hooks/useDrag";
import { useViewport } from "./hooks/useViewport";
import { Header } from "./components/Header";
import { BoardCanvas } from "./components/BoardCanvas";
import { DebugPanel } from "./components/DebugPanel";
import { AddNoteDialog } from "./components/AddNoteDialog";
import { WriteKeyDialog } from "./components/WriteKeyDialog";
import { ApiError, getConfig } from "./lib/api";
import { DEBUG_UI } from "./lib/flags";
import { getWriteKey, hasWriteKey, setWriteKey } from "./lib/auth";
import { log } from "./lib/log";

export default function App() {
  const { board, status, setStatus, refresh, addNote, addFiles, moveItem, removeItem } = useBoard();
  const canvasRef = useRef<HTMLElement>(null);
  const lastPointRef = useRef<Point>({ x: 60, y: 60 });
  const viewRef = useRef<Viewport>({ panX: 0, panY: 0, zoom: 1 });
  const [debugOpen, setDebugOpen] = useState(false);
  const [writeProtected, setWriteProtected] = useState(false);
  const [keySet, setKeySet] = useState(hasWriteKey());
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  // Dialogs are async (unlike window.prompt), so flows that need to retry after a
  // key is saved (initial load, write-failure recovery) stash their continuation here.
  const afterKeySavedRef = useRef<(() => void) | null>(null);

  const openWriteKeyDialog = useCallback((onSaved?: () => void) => {
    afterKeySavedRef.current = onSaved ?? null;
    setKeyDialogOpen(true);
  }, []);

  const handleWriteKeySubmit = useCallback(
    (next: string) => {
      setKeyDialogOpen(false);
      setWriteKey(next);
      setKeySet(hasWriteKey());
      setStatus(next.trim() ? "編集キーを保存しました。" : "編集キーを消去しました。");
      const after = afterKeySavedRef.current;
      afterKeySavedRef.current = null;
      after?.();
    },
    [setStatus],
  );

  const handleWriteKeyCancel = useCallback(() => {
    setKeyDialogOpen(false);
    afterKeySavedRef.current = null;
  }, []);

  // Turn a failed write into a helpful message; on 401 invite the user to (re)set
  // the key. Returns nothing — sets status as a side effect.
  const reportWriteError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        setStatus("編集キーが必要です（または不正です）。ヘッダーの「編集キー」から設定してください。");
        openWriteKeyDialog();
        return;
      }
      setStatus(error instanceof Error ? error.message : String(error));
    },
    [setStatus, openWriteKeyDialog],
  );

  const { view, panning, onBackgroundPointerDown, zoomIn, zoomOut, reset, fitToContent } = useViewport({
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
        reportWriteError(error);
      }
    },
    [addFiles, setStatus, reportWriteError],
  );

  const handleFiles = useCallback(
    (files: File[]) => uploadAt(files, lastPointRef.current),
    [uploadAt],
  );

  const handleAddNoteClick = useCallback(() => setNoteDialogOpen(true), []);

  const handleAddNoteCancel = useCallback(() => setNoteDialogOpen(false), []);

  const handleAddNoteSubmit = useCallback(
    async (text: string) => {
      setNoteDialogOpen(false);
      try {
        setStatus("テキストを追加しています...");
        await addNote(text, lastPointRef.current);
        setStatus("テキストを追加しました。");
      } catch (error) {
        reportWriteError(error);
      }
    },
    [addNote, setStatus, reportWriteError],
  );

  const handleDelete = useCallback(
    async (itemId: string) => {
      try {
        await removeItem(itemId);
      } catch (error) {
        reportWriteError(error);
      }
    },
    [removeItem, reportWriteError],
  );

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus("共有 URL をコピーしました。");
    } catch {
      setStatus(`URL をコピーできませんでした: ${window.location.href}`);
    }
  }, [setStatus]);

  // Initial load. Creating a board is a write, so on a protected instance the
  // auto-create at "/" can 401 — prompt for the key and retry once. Opening an
  // existing /boards/:id is a read and never trips this.
  useEffect(() => {
    log("load", `path=${window.location.pathname}`);
    const onFail = (error: unknown, allowRetry: boolean) => {
      if (allowRetry && error instanceof ApiError && error.status === 401) {
        setStatus("ボードの作成には編集キーが必要です。設定してください。");
        openWriteKeyDialog(() => {
          refresh().catch((retryError) => onFail(retryError, false));
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setStatus(message);
      log("refreshBoard failed", message, "error");
    };
    refresh().catch((error) => onFail(error, true));
  }, [refresh, setStatus, openWriteKeyDialog]);

  // Learn whether the server enforces a write key, and nudge if one is needed.
  useEffect(() => {
    getConfig()
      .then((config) => {
        setWriteProtected(config.writeProtected);
        if (config.writeProtected && !hasWriteKey()) {
          setStatus("このボードは編集に編集キーが必要です。ヘッダーの「編集キー」から設定してください。");
        }
      })
      .catch((error) => log("config fetch failed", String(error), "warn"));
  }, [setStatus]);

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
          reportWriteError(error);
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
        reportWriteError(error);
      }
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addFiles, addNote, setStatus, reportWriteError]);

  return (
    <div className="app-shell">
      <Header
        onFiles={handleFiles}
        onAddNote={handleAddNoteClick}
        showDebug={DEBUG_UI}
        onToggleDebug={() => setDebugOpen((open) => !open)}
        debugOpen={debugOpen}
        onCopyLink={handleCopyLink}
        writeProtected={writeProtected}
        keySet={keySet}
        onEditKey={openWriteKeyDialog}
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
        onFitToContent={fitToContent}
        onDragStart={startDrag}
        onDropFiles={uploadAt}
        onDelete={handleDelete}
      />
      {DEBUG_UI && <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} onCopyStatus={setStatus} />}
      <AddNoteDialog open={noteDialogOpen} onSubmit={handleAddNoteSubmit} onCancel={handleAddNoteCancel} />
      <WriteKeyDialog
        open={keyDialogOpen}
        initialValue={getWriteKey()}
        onSubmit={handleWriteKeySubmit}
        onCancel={handleWriteKeyCancel}
      />
    </div>
  );
}
