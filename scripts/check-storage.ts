/**
 * Storage integration smoke test (run manually).
 *
 *   npm run check:storage
 *
 * Driver-agnostic: it exercises whatever STORAGE_DRIVER points at (vercel-blob,
 * pcloud, ...). Storage providers perform irreversible operations (overwrite,
 * delete), so before trusting one in production we validate the real backend in
 * isolation — create a throwaway board + blob, read both back, then delete —
 * logging every step so a failure is diagnosable from logs alone.
 */

import { getStorage } from "../lib/storage";
import { makeBoard } from "../lib/domain/board";
import { logger } from "../lib/logger";

async function main(): Promise<void> {
  const storage = getStorage();
  logger.info("check.start", { driver: storage.name });

  const health = await storage.health();
  logger.info("check.health", { health });
  if (!health.ok) {
    throw new Error(`storage health check failed for ${storage.name}`);
  }

  // --- blob round-trip ---------------------------------------------------
  const payload = Buffer.from(`hello ${storage.name} ${Date.now()}`, "utf8");
  const ref = await storage.blobs.put({
    data: payload,
    fileName: "healthcheck.txt",
    contentType: "text/plain",
  });
  logger.info("check.blob.put", { ref });

  const read = await storage.blobs.read(ref);
  const chunks: Buffer[] = [];
  for await (const chunk of read.stream) {
    chunks.push(Buffer.from(chunk));
  }
  if (!Buffer.concat(chunks).equals(payload)) {
    throw new Error("blob round-trip mismatch");
  }
  logger.info("check.blob.read.ok", { bytes: payload.length });

  const url = await storage.blobs.directUrl(ref);
  logger.info("check.blob.directUrl", { hasUrl: Boolean(url) });

  // --- board metadata round-trip ----------------------------------------
  const board = makeBoard("healthcheck board");
  await storage.metadata.putBoard(board);
  const fetched = await storage.metadata.getBoard(board.id);
  if (!fetched || fetched.id !== board.id) {
    throw new Error("board metadata round-trip failed");
  }
  logger.info("check.board.ok", { boardId: board.id });

  // --- cleanup (the irreversible ops, on throwaway data only) -----------
  await storage.blobs.delete(ref);
  await storage.metadata.deleteBoard(board.id);
  logger.info("check.cleanup.ok", {});

  logger.info("check.done", { result: "PASS", driver: storage.name });
  console.log(`\nStorage integration check (${storage.name}): PASS`);
}

main().catch((error) => {
  logger.error("check.fail", { error });
  console.error("\nStorage integration check: FAIL —", error);
  process.exit(1);
});
