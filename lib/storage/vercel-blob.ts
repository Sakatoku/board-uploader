/**
 * Vercel Blob-backed StorageProvider.
 *
 * Layout (pathnames within the Blob store):
 *   boards/<boardId>.json   -> one document per board
 *   blobs/<uuid><ext>       -> uploaded file binaries
 *
 * Notes / trade-offs:
 * - Vercel Blob only supports `access: 'public'`, so every object is readable
 *   by anyone who knows its (unguessable) URL. That matches our current
 *   no-auth posture; Phase 2 auth must avoid handing these URLs to the client
 *   directly (proxy downloads through an authenticated route instead).
 * - Blob addresses by full URL, not by pathname. Board documents are written
 *   with `addRandomSuffix: false`, so their URL is fully deterministic:
 *   `https://<storeId>.public.blob.vercel-storage.com/<pathname>`, where
 *   storeId is embedded in BLOB_READ_WRITE_TOKEN. We try that direct URL
 *   first (no network round-trip to resolve it, and no `list()` eventual
 *   consistency lag) and only fall back to `list({ prefix })` if it 404s or
 *   the store id can't be parsed (e.g. a non-Vercel token in tests). We
 *   memoise boardId -> url in-process to keep warm reads fast either way.
 */

import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { put, del, list } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type {
  BlobInput,
  BlobReadResult,
  BlobStore,
  ClientUploadStore,
  GcStore,
  HealthResult,
  MetadataStore,
  PendingMarkerInfo,
  StorageProvider,
} from "./provider";
import type { Board, BlobRef } from "../domain/types";
import { logger, timed } from "../logger";
import { runOrphanGc } from "../gc/orphan";

export interface VercelBlobProviderConfig {
  /** Falls back to the SDK's BLOB_READ_WRITE_TOKEN env var when omitted. */
  token?: string;
}

/**
 * Cap on a single browser-direct upload. Well above the ~4.5MB function-body
 * limit this path exists to bypass, but bounded so a scoped client token can't
 * be abused to write arbitrarily large objects to the store.
 */
const MAX_DIRECT_UPLOAD_BYTES = 100 * 1024 * 1024;

export class VercelBlobStorageProvider implements StorageProvider {
  readonly name = "vercel-blob";

  private readonly token?: string;
  private readonly boardUrlCache = new Map<string, string>();

  constructor(config: VercelBlobProviderConfig = {}) {
    this.token = config.token;
  }

  /** Options object shared by every SDK call (token is optional on Vercel). */
  private opts<T extends object>(extra: T): T & { token?: string } {
    return this.token ? { ...extra, token: this.token } : extra;
  }

  private boardPathname(boardId: string): string {
    return `boards/${boardId}.json`;
  }

  /**
   * Derive the board's URL straight from the token's store id, with no
   * network call. Returns null when the token isn't a recognisable Vercel
   * Blob token (e.g. mock/test tokens) so callers can fall back to `list()`.
   */
  private deterministicBoardUrl(boardId: string): string | null {
    const token = this.token || process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return null;
    }
    const storeId = token.split("_")[3];
    if (!storeId) {
      return null;
    }
    return `https://${storeId}.public.blob.vercel-storage.com/${this.boardPathname(boardId)}`;
  }

  /** Resolve a board document's URL, using the cache then a prefix list. */
  private async findBoardUrl(boardId: string): Promise<string | null> {
    const cached = this.boardUrlCache.get(boardId);
    if (cached) {
      return cached;
    }
    const pathname = this.boardPathname(boardId);
    const result = await timed("blob.list", { prefix: pathname }, () =>
      list(this.opts({ prefix: pathname, limit: 1 })),
    );
    const match = result.blobs.find((b) => b.pathname === pathname);
    if (match) {
      this.boardUrlCache.set(boardId, match.url);
      return match.url;
    }
    return null;
  }

  /**
   * Fetch and parse a board document from a known URL. Returns `undefined`
   * (rather than throwing) on a 404 so the caller can try another URL.
   */
  private async readBoardFrom(url: string, boardId: string): Promise<Board | null | undefined> {
    // Board JSON is mutable, but Vercel Blob serves every public URL through
    // a CDN whose minimum cache TTL is 60s. After an overwrite (e.g. adding a
    // note) a plain fetch of the stable URL can return the *pre-write* body
    // for up to a minute, which makes freshly-added items 404 on the next
    // request and "disappear". Bust the edge cache with a unique query string
    // and disable the runtime fetch cache so reads are always read-after-write
    // consistent.
    let bytes: Buffer;
    try {
      bytes = await fetchBytes(`${url}?_cb=${Date.now()}`, { cache: "no-store" });
    } catch (error) {
      if (error instanceof BlobFetchError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
    try {
      return JSON.parse(bytes.toString("utf8")) as Board;
    } catch (error) {
      logger.error("blob.board.parse_fail", { boardId, error });
      throw new Error(`Board document for ${boardId} is corrupt`);
    }
  }

  readonly metadata: MetadataStore = {
    getBoard: async (boardId) => {
      const cached = this.boardUrlCache.get(boardId);
      const direct = cached ?? this.deterministicBoardUrl(boardId);
      if (direct) {
        const board = await this.readBoardFrom(direct, boardId);
        if (board !== undefined) {
          this.boardUrlCache.set(boardId, direct);
          return board;
        }
        // Direct URL 404'd (or the cached entry is stale) - fall back below.
      }
      const url = await this.findBoardUrl(boardId);
      if (!url) {
        return null;
      }
      const board = await this.readBoardFrom(url, boardId);
      return board ?? null;
    },
    putBoard: async (board) => {
      const result = await timed(
        "blob.board.put",
        { boardId: board.id, items: board.items.length },
        () =>
          put(
            this.boardPathname(board.id),
            JSON.stringify(board, null, 2),
            this.opts({
              access: "public" as const,
              contentType: "application/json",
              addRandomSuffix: false,
              allowOverwrite: true,
              // Minimum allowed (60s). Combined with the cache-busting read in
              // getBoard this keeps mutable board state fresh; on its own the
              // SDK floor of 60s would still allow up to a minute of staleness.
              cacheControlMaxAge: 60,
            }),
          ),
      );
      this.boardUrlCache.set(board.id, result.url);
    },
    deleteBoard: async (boardId) => {
      const url = await this.findBoardUrl(boardId);
      if (url) {
        await del(url, this.opts({}));
        this.boardUrlCache.delete(boardId);
        logger.info("blob.board.delete", { boardId });
      }
    },
  };

  readonly blobs: BlobStore = {
    put: async (input: BlobInput): Promise<BlobRef> => {
      const ext = path.extname(input.fileName) || "";
      const pathname = `blobs/${randomUUID()}${ext}`;
      const result = await timed(
        "blob.put",
        { pathname, bytes: input.data.length },
        () =>
          put(
            pathname,
            input.data,
            this.opts({
              access: "public" as const,
              contentType: input.contentType || "application/octet-stream",
              addRandomSuffix: false,
            }),
          ),
      );
      // The full URL is the durable handle; store it as the ref key.
      return { provider: this.name, key: result.url };
    },
    read: async (ref: BlobRef): Promise<BlobReadResult> => {
      const res = await fetch(ref.key);
      if (!res.ok || !res.body) {
        throw new Error(`blob read failed: HTTP ${res.status}`);
      }
      return {
        stream: Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
        contentType: res.headers.get("content-type") || "application/octet-stream",
        size: Number(res.headers.get("content-length")) || 0,
      };
    },
    // The blob URL is already a CDN-served public link — hand it straight back.
    directUrl: async (ref: BlobRef): Promise<string | null> => ref.key,
    delete: async (ref: BlobRef): Promise<void> => {
      await del(ref.key, this.opts({}));
    },
  };

  readonly gc: GcStore = {
    putPendingMarker: async ({ blobUrl, boardId }) => {
      const hash = createHash("sha256").update(blobUrl).digest("hex").slice(0, 16);
      const pathname = `gc-pending/${hash}.json`;
      const body = JSON.stringify({ blobUrl, boardId, createdAt: new Date().toISOString() });
      await put(
        pathname,
        body,
        this.opts({
          access: "public" as const,
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: true,
        }),
      );
    },

    deletePendingMarker: async (blobUrl) => {
      const hash = createHash("sha256").update(blobUrl).digest("hex").slice(0, 16);
      const pathname = `gc-pending/${hash}.json`;
      const result = await list(this.opts({ prefix: pathname, limit: 1 }));
      const match = result.blobs.find((b) => b.pathname === pathname);
      if (match) {
        await del(match.url, this.opts({}));
      }
    },

    listPendingMarkers: async () => {
      const result = await list(this.opts({ prefix: "gc-pending/", limit: 1000 }));
      const markers: PendingMarkerInfo[] = [];
      for (const blob of result.blobs) {
        try {
          const bytes = await fetchBytes(blob.url, { cache: "no-store" });
          const parsed = JSON.parse(bytes.toString("utf8")) as {
            blobUrl: string;
            boardId: string;
          };
          markers.push({
            blobUrl: parsed.blobUrl,
            boardId: parsed.boardId,
            uploadedAt: new Date(blob.uploadedAt),
          });
        } catch (error) {
          logger.warn("gc.marker.parse_fail", { url: blob.url, error });
        }
      }
      return markers;
    },
  };

  readonly clientUpload: ClientUploadStore = {
    maxBytes: MAX_DIRECT_UPLOAD_BYTES,
    handleTokenRequest: async ({ body, request, boardId, authorizeClientPayload }) => {
      // The @vercel/blob client SDK drives a two-step handshake: it asks us for
      // a scoped token, uploads straight to Blob, then (on Vercel) pings us back
      // with the result. We don't rely on the completion ping to attach the
      // item — the client calls /files/attach explicitly — but still log it.
      return handleUpload({
        token: this.token,
        body: body as HandleUploadBody,
        request: request as Parameters<typeof handleUpload>[0]["request"],
        onBeforeGenerateToken: async (_pathname, clientPayload) => {
          // The write key rides in clientPayload (the SDK owns this request, so
          // we can't gate it with the X-API-Key header middleware).
          if (authorizeClientPayload && !authorizeClientPayload(clientPayload)) {
            logger.warn("auth.upload_token.denied", { boardId });
            throw new Error("A valid write key is required.");
          }
          return {
            addRandomSuffix: true,
            maximumSizeInBytes: MAX_DIRECT_UPLOAD_BYTES,
            tokenPayload: JSON.stringify({ boardId }),
          };
        },
        onUploadCompleted: async ({ blob }) => {
          logger.info("blob.client_upload.completed", { boardId, url: blob.url });

          try {
            await this.gc.putPendingMarker({ blobUrl: blob.url, boardId });
          } catch (error) {
            logger.warn("gc.marker.write_fail", { blobUrl: blob.url, boardId, error });
          }

          // Fire-and-forget: grace-period markers won't be touched anyway.
          runOrphanGc(this).catch((error) => {
            logger.warn("gc.silent_run.fail", { error });
          });
        },
      });
    },
  };

  async health(): Promise<HealthResult> {
    try {
      // A cheap list proves the token works and the store is reachable.
      await list(this.opts({ limit: 1 }));
      return { ok: true, provider: this.name };
    } catch (error) {
      logger.error("blob.health.fail", { error });
      return {
        ok: false,
        provider: this.name,
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}

class BlobFetchError extends Error {
  constructor(public readonly status: number) {
    super(`blob fetch failed: HTTP ${status}`);
  }
}

async function fetchBytes(url: string, init?: RequestInit): Promise<Buffer> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new BlobFetchError(res.status);
  }
  return Buffer.from(await res.arrayBuffer());
}
