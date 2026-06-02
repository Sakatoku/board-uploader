/**
 * pCloud integration smoke test (run manually, never in CI by default).
 *
 *   npx tsx scripts/check-pcloud.ts
 *
 * Why this exists (implementation stance): the pCloud client performs
 * irreversible operations (overwrite, delete). Before the app relies on it we
 * validate the real integration in isolation, against a throwaway file under
 * <root>/_healthcheck, and log every step so failures are diagnosable.
 *
 * It requires real credentials in the environment (PCLOUD_ACCESS_TOKEN, etc.).
 */

import { randomUUID } from "node:crypto";
import { PCloudStorageProvider } from "../lib/storage/pcloud";
import { logger } from "../lib/logger";

async function main(): Promise<void> {
  const provider = new PCloudStorageProvider({
    region: process.env.PCLOUD_REGION,
    accessToken: process.env.PCLOUD_ACCESS_TOKEN,
    username: process.env.PCLOUD_USERNAME,
    password: process.env.PCLOUD_PASSWORD,
    // Keep test artifacts away from real data.
    rootPath: (process.env.PCLOUD_ROOT_PATH || "/board-uploader") + "/_healthcheck",
  });

  logger.info("check.start", {});

  const health = await provider.health();
  logger.info("check.health", { health });
  if (!health.ok) {
    throw new Error("pCloud health check failed");
  }

  // 1. Put a blob.
  const payload = Buffer.from(`hello pcloud ${randomUUID()}`, "utf8");
  const ref = await provider.blobs.put({
    data: payload,
    fileName: "healthcheck.txt",
    contentType: "text/plain",
  });
  logger.info("check.put", { ref });

  // 2. Read it back and verify byte-for-byte.
  const read = await provider.blobs.read(ref);
  const chunks: Buffer[] = [];
  for await (const chunk of read.stream) {
    chunks.push(Buffer.from(chunk));
  }
  const roundTrip = Buffer.concat(chunks);
  if (!roundTrip.equals(payload)) {
    throw new Error("round-trip mismatch: read bytes differ from written bytes");
  }
  logger.info("check.read.ok", { bytes: roundTrip.length });

  // 3. Direct URL (used by the download redirect path).
  const url = await provider.blobs.directUrl(ref);
  logger.info("check.directUrl", { hasUrl: Boolean(url) });

  // 4. Delete (the irreversible op) — on the throwaway file only.
  await provider.blobs.delete(ref);
  logger.info("check.delete.ok", { ref });

  logger.info("check.done", { result: "PASS" });
  console.log("\npCloud integration check: PASS");
}

main().catch((error) => {
  logger.error("check.fail", { error });
  console.error("\npCloud integration check: FAIL —", error);
  process.exit(1);
});
