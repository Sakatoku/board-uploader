/**
 * Storage factory.
 *
 * Selects a provider from environment so handlers stay storage-agnostic:
 *   STORAGE_DRIVER=mock         -> in-memory (local dev / tests; not durable)
 *   STORAGE_DRIVER=vercel-blob  -> Vercel Blob (default in production)
 *   STORAGE_DRIVER=pcloud       -> pCloud (kept as an alternative backend)
 *
 * The instance is memoised per process so we reuse auth/connection setup.
 */

import type { StorageProvider } from "./provider";
import { MockStorageProvider } from "./mock";
import { PCloudStorageProvider } from "./pcloud";
import { VercelBlobStorageProvider } from "./vercel-blob";
import { logger } from "../logger";

export * from "./provider";
export { MockStorageProvider } from "./mock";
export { PCloudStorageProvider } from "./pcloud";
export { VercelBlobStorageProvider } from "./vercel-blob";

let cached: StorageProvider | undefined;

export function createStorageProvider(): StorageProvider {
  const driver = (process.env.STORAGE_DRIVER || "vercel-blob").toLowerCase();

  if (driver === "mock") {
    logger.info("storage.init", { driver: "mock" });
    return new MockStorageProvider();
  }

  if (driver === "vercel-blob" || driver === "blob") {
    logger.info("storage.init", { driver: "vercel-blob" });
    return new VercelBlobStorageProvider({
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  }

  if (driver === "pcloud") {
    logger.info("storage.init", { driver: "pcloud" });
    return new PCloudStorageProvider({
      region: process.env.PCLOUD_REGION,
      accessToken: process.env.PCLOUD_ACCESS_TOKEN,
      username: process.env.PCLOUD_USERNAME,
      password: process.env.PCLOUD_PASSWORD,
      rootPath: process.env.PCLOUD_ROOT_PATH,
    });
  }

  throw new Error(`Unknown STORAGE_DRIVER: ${driver}`);
}

/** Process-wide singleton (reused across warm serverless invocations). */
export function getStorage(): StorageProvider {
  if (!cached) {
    cached = createStorageProvider();
  }
  return cached;
}

/** Test helper to reset the memoised provider. */
export function resetStorageForTests(): void {
  cached = undefined;
}
