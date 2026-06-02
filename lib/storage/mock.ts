/**
 * In-memory storage provider.
 *
 * This is the safe default: it lets us exercise every handler — including the
 * irreversible delete/overwrite paths — without touching real pCloud data.
 * Used by the unit tests and by local dev when STORAGE_DRIVER=mock.
 *
 * Note: state lives in the process, so on Vercel (where each invocation may be
 * a fresh instance) this is NOT durable. It is for local/testing only.
 */

import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import type {
  BlobInput,
  BlobReadResult,
  BlobStore,
  HealthResult,
  MetadataStore,
  StorageProvider,
} from "./provider";
import type { Board, BlobRef } from "../domain/types";

interface StoredBlob {
  data: Buffer;
  contentType: string;
}

export class MockStorageProvider implements StorageProvider {
  readonly name = "mock";

  private readonly boards = new Map<string, Board>();
  private readonly blobStore = new Map<string, StoredBlob>();

  readonly metadata: MetadataStore = {
    getBoard: async (boardId) => {
      const board = this.boards.get(boardId);
      // Return a deep copy so callers can't mutate our store by reference.
      return board ? structuredClone(board) : null;
    },
    putBoard: async (board) => {
      this.boards.set(board.id, structuredClone(board));
    },
    deleteBoard: async (boardId) => {
      this.boards.delete(boardId);
    },
  };

  readonly blobs: BlobStore = {
    put: async (input: BlobInput): Promise<BlobRef> => {
      const key = randomUUID();
      this.blobStore.set(key, {
        data: Buffer.from(input.data),
        contentType: input.contentType,
      });
      return { provider: this.name, key };
    },
    read: async (ref: BlobRef): Promise<BlobReadResult> => {
      const blob = this.blobStore.get(ref.key);
      if (!blob) {
        throw new Error(`mock blob not found: ${ref.key}`);
      }
      return {
        stream: Readable.from(blob.data),
        contentType: blob.contentType,
        size: blob.data.length,
      };
    },
    directUrl: async () => null,
    delete: async (ref: BlobRef) => {
      this.blobStore.delete(ref.key);
    },
  };

  async health(): Promise<HealthResult> {
    return {
      ok: true,
      provider: this.name,
      details: { boards: this.boards.size, blobs: this.blobStore.size },
    };
  }

  /** Test helper: wipe all state. */
  reset(): void {
    this.boards.clear();
    this.blobStore.clear();
  }
}
