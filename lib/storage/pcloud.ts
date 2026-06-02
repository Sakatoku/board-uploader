/**
 * pCloud-backed StorageProvider.
 *
 * Layout under PCLOUD_ROOT_PATH (default /board-uploader):
 *   /boards/<boardId>.json   -> one document per board (small blast radius)
 *   /blobs/<uuid><ext>       -> uploaded file binaries
 *
 * Board documents are tiny JSON files. We rely on pCloud's file revisions so
 * that an overwrite of a board document is recoverable if a write goes wrong.
 */

import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type {
  BlobInput,
  BlobReadResult,
  BlobStore,
  HealthResult,
  MetadataStore,
  StorageProvider,
} from "./provider";
import type { Board, BlobRef } from "../domain/types";
import { PCloudClient, PCloudError, type PCloudClientConfig } from "./pcloud-client";
import { logger } from "../logger";

export interface PCloudProviderConfig extends PCloudClientConfig {
  rootPath?: string;
}

export class PCloudStorageProvider implements StorageProvider {
  readonly name = "pcloud";

  private readonly client: PCloudClient;
  private readonly rootPath: string;
  private readonly boardsPath: string;
  private readonly blobsPath: string;
  private foldersReady?: Promise<void>;

  constructor(config: PCloudProviderConfig) {
    this.client = new PCloudClient(config);
    this.rootPath = (config.rootPath || "/board-uploader").replace(/\/+$/, "");
    this.boardsPath = `${this.rootPath}/boards`;
    this.blobsPath = `${this.rootPath}/blobs`;
  }

  /** Lazily create the folder layout once per process. */
  private ensureFolders(): Promise<void> {
    if (!this.foldersReady) {
      this.foldersReady = (async () => {
        await this.client.ensureFolder(this.rootPath);
        await this.client.ensureFolder(this.boardsPath);
        await this.client.ensureFolder(this.blobsPath);
      })().catch((error) => {
        // Reset so a later call can retry instead of caching the failure.
        this.foldersReady = undefined;
        throw error;
      });
    }
    return this.foldersReady;
  }

  private boardFilePath(boardId: string): string {
    return `${this.boardsPath}/${boardId}.json`;
  }

  readonly metadata: MetadataStore = {
    getBoard: async (boardId) => {
      const meta = await this.client.statByPath(this.boardFilePath(boardId));
      if (!meta) {
        return null;
      }
      const bytes = await this.client.downloadFile(meta.fileid);
      try {
        return JSON.parse(bytes.toString("utf8")) as Board;
      } catch (error) {
        logger.error("pcloud.board.parse_fail", { boardId, error });
        throw new Error(`Board document for ${boardId} is corrupt`);
      }
    },
    putBoard: async (board) => {
      await this.ensureFolders();
      const body = Buffer.from(JSON.stringify(board, null, 2), "utf8");
      await this.client.uploadFile(
        this.boardsPath,
        `${board.id}.json`,
        body,
        "application/json",
      );
      logger.info("pcloud.board.put", { boardId: board.id, items: board.items.length });
    },
    deleteBoard: async (boardId) => {
      const meta = await this.client.statByPath(this.boardFilePath(boardId));
      if (meta) {
        await this.client.deleteFile(meta.fileid);
        logger.info("pcloud.board.delete", { boardId });
      }
    },
  };

  readonly blobs: BlobStore = {
    put: async (input: BlobInput): Promise<BlobRef> => {
      await this.ensureFolders();
      const ext = path.extname(input.fileName) || "";
      const storedName = `${randomUUID()}${ext}`;
      const meta = await this.client.uploadFile(
        this.blobsPath,
        storedName,
        input.data,
        input.contentType,
      );
      return { provider: this.name, key: String(meta.fileid) };
    },
    read: async (ref: BlobRef): Promise<BlobReadResult> => {
      const fileId = Number(ref.key);
      const bytes = await this.client.downloadFile(fileId);
      return {
        stream: Readable.from(bytes),
        contentType: "application/octet-stream",
        size: bytes.length,
      };
    },
    directUrl: async (ref: BlobRef): Promise<string | null> => {
      try {
        return await this.client.getFileLink(Number(ref.key));
      } catch (error) {
        logger.warn("pcloud.directUrl.fail", { key: ref.key, error });
        return null;
      }
    },
    delete: async (ref: BlobRef): Promise<void> => {
      try {
        await this.client.deleteFile(Number(ref.key));
      } catch (error) {
        // A missing file is fine to ignore on delete (idempotency).
        if (error instanceof PCloudError && error.code === 2009) {
          return;
        }
        throw error;
      }
    },
  };

  async health(): Promise<HealthResult> {
    try {
      await this.ensureFolders();
      return { ok: true, provider: this.name, details: { rootPath: this.rootPath } };
    } catch (error) {
      logger.error("pcloud.health.fail", { error });
      return {
        ok: false,
        provider: this.name,
        details: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}
