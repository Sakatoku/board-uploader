import type { Board, Point } from "../types";
import { log } from "./log";

/** Error carrying the HTTP status so callers can treat 404 as transient. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || "GET";
  log("api →", `${method} ${path}`);

  let response: Response;
  try {
    response = await fetch(path, {
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("api ✗ network", `${method} ${path} :: ${message}`, "error");
    throw error;
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
    board?: Board;
  };

  if (!response.ok) {
    log("api ✗", `${method} ${path} → ${response.status} ${payload.error || ""}`, "error");
    throw new ApiError(payload.error || "Request failed.", response.status);
  }

  const itemCount = payload.board?.items?.length;
  log(
    "api ✓",
    `${method} ${path} → ${response.status}${itemCount === undefined ? "" : ` (items=${itemCount})`}`,
  );
  return payload as T;
}

export async function createBoard(): Promise<Board> {
  const payload = await apiFetch<{ board: Board }>("/api/boards", {
    method: "POST",
    body: JSON.stringify({ title: "Shared board" }),
  });
  return payload.board;
}

export async function getBoard(boardId: string): Promise<Board> {
  const payload = await apiFetch<{ board: Board }>(`/api/boards/${boardId}`);
  return payload.board;
}

export async function createNote(boardId: string, text: string, point: Point): Promise<Board> {
  log("createNote", `point=(${point.x},${point.y}) len=${text.length}`);
  const payload = await apiFetch<{ board: Board }>(`/api/boards/${boardId}/notes`, {
    method: "POST",
    body: JSON.stringify({ text, x: point.x, y: point.y }),
  });
  return payload.board;
}

export async function uploadFiles(boardId: string, files: File[], point: Point): Promise<Board> {
  log("uploadFiles", `point=(${point.x},${point.y}) files=${files.length}`);
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("x", String(point.x));
  formData.append("y", String(point.y));

  const payload = await apiFetch<{ board: Board }>(`/api/boards/${boardId}/files`, {
    method: "POST",
    body: formData,
  });
  return payload.board;
}

/**
 * Persist a position. The backing store (Vercel Blob) is eventually
 * consistent, so a freshly-added item may not be readable for a few seconds
 * and PATCH returns 404. Treat that as transient and retry with backoff.
 */
export async function persistItemPosition(
  boardId: string,
  itemId: string,
  x: number,
  y: number,
): Promise<void> {
  const delays = [400, 800, 1500, 2500, 4000];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      await apiFetch(`/api/boards/${boardId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ x, y }),
      });
      return;
    } catch (error) {
      const transient = error instanceof ApiError && error.status === 404;
      if (!transient || attempt === delays.length) {
        throw error;
      }
      const wait = delays[attempt];
      log(
        "persist retry (store catching up)",
        `id=${itemId.slice(0, 8)} attempt=${attempt + 1} wait=${wait}ms`,
        "warn",
      );
      await sleep(wait);
    }
  }
}

export const contentUrl = (boardId: string, itemId: string) =>
  `/api/boards/${boardId}/items/${itemId}/content`;

export const downloadUrl = (boardId: string, itemId: string) =>
  `/api/boards/${boardId}/items/${itemId}/download`;
