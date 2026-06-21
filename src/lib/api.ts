import { upload } from "@vercel/blob/client";
import type { Board, BoardItem, Point } from "../types";
import { getWriteKey } from "./auth";
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
    const writeKey = getWriteKey();
    response = await fetch(path, {
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        // Harmless on reads; required by the write gate when one is configured.
        ...(writeKey ? { "X-API-Key": writeKey } : {}),
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

interface AppConfig {
  uploadStrategy: "direct" | "proxy";
  maxUploadBytes: number | null;
  writeProtected: boolean;
}

let configPromise: Promise<AppConfig> | null = null;

/** Fetch (and cache) the server's upload capability. */
export function getConfig(): Promise<AppConfig> {
  configPromise ??= apiFetch<AppConfig>("/api/config").catch((error) => {
    // On failure, fall back to the always-available proxy path.
    configPromise = null;
    log("config fetch failed (assuming proxy)", String(error), "warn");
    return { uploadStrategy: "proxy", maxUploadBytes: null, writeProtected: false };
  });
  return configPromise;
}

/** Place uploaded files starting at `point`, fanning out so they don't stack. */
function placement(point: Point, index: number): Point {
  return { x: point.x + index * 28, y: point.y + index * 28 };
}

export async function uploadFiles(boardId: string, files: File[], point: Point): Promise<Board> {
  const config = await getConfig();
  log("uploadFiles", `strategy=${config.uploadStrategy} point=(${point.x},${point.y}) files=${files.length}`);
  return config.uploadStrategy === "direct"
    ? uploadFilesDirect(boardId, files, point, config)
    : uploadFilesProxy(boardId, files, point);
}

/** Proxy path: multipart through the function (mock/pcloud, local dev). */
async function uploadFilesProxy(boardId: string, files: File[], point: Point): Promise<Board> {
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
 * Direct path: upload each file straight to the storage backend (bypassing the
 * function body cap), then record the resulting URLs as board items.
 */
async function uploadFilesDirect(
  boardId: string,
  files: File[],
  point: Point,
  config: AppConfig,
): Promise<Board> {
  if (config.maxUploadBytes != null) {
    const tooBig = files.find((file) => file.size > config.maxUploadBytes!);
    if (tooBig) {
      const mb = (config.maxUploadBytes / (1024 * 1024)).toFixed(0);
      throw new Error(`「${tooBig.name}」が大きすぎます（上限 ${mb}MB）。`);
    }
  }

  const uploaded = await Promise.all(
    files.map(async (file, index) => {
      log("direct upload →", `${file.name} (${file.size}B)`);
      const result = await upload(`blobs/${file.name}`, file, {
        access: "public",
        contentType: file.type || undefined,
        handleUploadUrl: `/api/boards/${boardId}/upload-token`,
        // The SDK owns the token request, so the write key travels in the
        // payload (validated server-side in onBeforeGenerateToken).
        clientPayload: getWriteKey() || undefined,
      });
      const pos = placement(point, index);
      return {
        url: result.url,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        x: pos.x,
        y: pos.y,
      };
    }),
  );

  const payload = await apiFetch<{ board: Board }>(`/api/boards/${boardId}/files/attach`, {
    method: "POST",
    body: JSON.stringify({ files: uploaded }),
  });
  return payload.board;
}

export async function deleteItem(boardId: string, itemId: string): Promise<Board> {
  const payload = await apiFetch<{ board: Board }>(
    `/api/boards/${boardId}/items/${itemId}`,
    { method: "DELETE" },
  );
  return payload.board;
}

/**
 * PATCH an item's fields. The backing store (Vercel Blob) is eventually
 * consistent, so a freshly-added item may not be readable for a few seconds
 * and PATCH returns 404. Treat that as transient and retry with backoff.
 */
async function patchItemWithRetry<T>(
  boardId: string,
  itemId: string,
  body: Record<string, unknown>,
): Promise<T> {
  const delays = [400, 800, 1500, 2500, 4000];
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await apiFetch<T>(`/api/boards/${boardId}/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
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
  // Unreachable: the loop above always returns or throws.
  throw new Error("patchItemWithRetry: exhausted retries without resolving");
}

export async function persistItemPosition(
  boardId: string,
  itemId: string,
  x: number,
  y: number,
): Promise<void> {
  await patchItemWithRetry(boardId, itemId, { x, y });
}

export async function renameItem(boardId: string, itemId: string, title: string): Promise<BoardItem> {
  const payload = await patchItemWithRetry<{ item: BoardItem }>(boardId, itemId, { title });
  return payload.item;
}

export const contentUrl = (boardId: string, itemId: string) =>
  `/api/boards/${boardId}/items/${itemId}/content`;

export const downloadUrl = (boardId: string, itemId: string) =>
  `/api/boards/${boardId}/items/${itemId}/download`;
