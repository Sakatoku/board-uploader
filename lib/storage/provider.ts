/**
 * Storage abstraction.
 *
 * The app never talks to pCloud directly. It talks to a `StorageProvider`,
 * which is split into two narrow concerns:
 *
 *   - MetadataStore: the source of truth for Boards (small JSON documents).
 *   - BlobStore:     the bytes of uploaded files.
 *
 * Both are backed by pCloud today, but the seam means we can swap in S3,
 * local disk, Redis, etc. without touching handlers (extensibility goal).
 *
 * Per-board documents (rather than one global JSON) keep the blast radius of
 * a corrupt write to a single board — see implementation stance on protecting
 * irreversible operations.
 */

import type { Board, BlobRef } from "../domain/types";

export interface BlobInput {
  data: Buffer;
  fileName: string;
  contentType: string;
}

export interface BlobReadResult {
  stream: NodeJS.ReadableStream;
  contentType: string;
  size: number;
}

export interface MetadataStore {
  getBoard(boardId: string): Promise<Board | null>;
  putBoard(board: Board): Promise<void>;
  deleteBoard(boardId: string): Promise<void>;
}

export interface BlobStore {
  /** Store bytes and return an opaque ref to retrieve them later. */
  put(input: BlobInput): Promise<BlobRef>;
  /** Stream bytes back (proxy path, bound by serverless body limits). */
  read(ref: BlobRef): Promise<BlobReadResult>;
  /**
   * Best-effort short-lived direct URL, when the backend can serve bytes
   * itself (e.g. pCloud getfilelink). Lets downloads bypass the function.
   * Returns null when unsupported.
   */
  directUrl(ref: BlobRef): Promise<string | null>;
  delete(ref: BlobRef): Promise<void>;
}

export interface HealthResult {
  ok: boolean;
  provider: string;
  details?: Record<string, unknown>;
}

export interface StorageProvider {
  readonly name: string;
  readonly metadata: MetadataStore;
  readonly blobs: BlobStore;
  /** Cheap connectivity probe used by /api/health and at boot. */
  health(): Promise<HealthResult>;
}
