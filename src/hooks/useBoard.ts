import { useCallback, useRef, useState } from "react";
import type { Board, Point } from "../types";
import * as api from "../lib/api";
import { log } from "../lib/log";

function getBoardIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/boards\/([^/]+)$/);
  return match ? match[1] : null;
}

async function ensureBoard(): Promise<Board> {
  const currentBoardId = getBoardIdFromPath();
  if (!currentBoardId) {
    const board = await api.createBoard();
    window.history.replaceState({}, "", `/boards/${board.id}`);
    return board;
  }
  return api.getBoard(currentBoardId);
}

export interface UseBoard {
  board: Board | null;
  status: string;
  setStatus: (message: string) => void;
  refresh: () => Promise<void>;
  addNote: (text: string, point: Point) => Promise<void>;
  addFiles: (files: File[], point: Point) => Promise<void>;
  /** Optimistically move an item locally, then persist (retrying on 404). */
  moveItem: (itemId: string, x: number, y: number) => Promise<void>;
  /** Optimistically rename an item locally, then persist (retrying on 404). */
  renameItem: (itemId: string, title: string) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
}

export function useBoard(): UseBoard {
  const [board, setBoardState] = useState<Board | null>(null);
  const [status, setStatus] = useState("ボードを準備しています...");
  const boardRef = useRef<Board | null>(null);

  const setBoard = useCallback((next: Board) => {
    boardRef.current = next;
    setBoardState(next);
  }, []);

  const refresh = useCallback(async () => {
    const next = await ensureBoard();
    setBoard(next);
    setStatus("ドラッグ、貼り付け、アップロードに対応しています。");
  }, [setBoard]);

  const addNote = useCallback(
    async (text: string, point: Point) => {
      const current = boardRef.current;
      if (!current) return;
      const next = await api.createNote(current.id, text, point);
      setBoard(next);
    },
    [setBoard],
  );

  const addFiles = useCallback(
    async (files: File[], point: Point) => {
      const current = boardRef.current;
      if (!current || files.length === 0) return;
      const next = await api.uploadFiles(current.id, files, point);
      setBoard(next);
    },
    [setBoard],
  );

  const moveItem = useCallback(
    async (itemId: string, x: number, y: number) => {
      const current = boardRef.current;
      if (!current) return;

      // Optimistic local update so the on-screen position is authoritative
      // even if the round-trip is slow or ultimately fails.
      const optimistic: Board = {
        ...current,
        items: current.items.map((item) =>
          item.id === itemId ? { ...item, x, y } : item,
        ),
      };
      setBoard(optimistic);

      try {
        await api.persistItemPosition(current.id, itemId, x, y);
        setStatus("位置を保存しました。");
        log("position saved", `id=${itemId.slice(0, 8)} → (${x},${y})`, "save");
      } catch (error) {
        // Keep the local position rather than refreshing, which would re-read a
        // possibly-stale board and make the item jump back or vanish.
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`位置の保存に失敗しました（表示は保持）: ${message}`);
        log("position save FAILED (kept local)", message, "error");
      }
    },
    [setBoard],
  );

  const renameItem = useCallback(
    async (itemId: string, title: string) => {
      const current = boardRef.current;
      if (!current) return;

      const optimistic: Board = {
        ...current,
        items: current.items.map((item) => (item.id === itemId ? { ...item, title } : item)),
      };
      setBoard(optimistic);

      try {
        const updated = await api.renameItem(current.id, itemId, title);
        const latest = boardRef.current ?? optimistic;
        setBoard({
          ...latest,
          items: latest.items.map((item) => (item.id === itemId ? updated : item)),
        });
        setStatus("名前を変更しました。");
      } catch (error) {
        setBoard(current);
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`名前の変更に失敗しました: ${message}`);
      }
    },
    [setBoard],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const current = boardRef.current;
      if (!current) return;

      const optimistic: Board = {
        ...current,
        items: current.items.filter((item) => item.id !== itemId),
      };
      setBoard(optimistic);

      try {
        const next = await api.deleteItem(current.id, itemId);
        setBoard(next);
        setStatus("アイテムを削除しました。");
      } catch (error) {
        setBoard(current);
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`削除に失敗しました: ${message}`);
      }
    },
    [setBoard],
  );

  return { board, status, setStatus, refresh, addNote, addFiles, moveItem, renameItem, removeItem };
}
