import type { StorageProvider } from "../storage/provider";
import { isFileItem } from "../domain/types";
import { logger } from "../logger";

export interface GcResult {
  scanned: number;
  orphansDeleted: number;
  markersDeleted: number;
  errors: number;
}

export async function runOrphanGc(
  storage: StorageProvider,
  opts: { gracePeriodMs?: number } = {},
): Promise<GcResult> {
  const gracePeriodMs = opts.gracePeriodMs ?? 10 * 60 * 1000;

  if (!storage.gc) {
    logger.info("gc.skip", { reason: "GcStore not available" });
    return { scanned: 0, orphansDeleted: 0, markersDeleted: 0, errors: 0 };
  }

  const markers = await storage.gc.listPendingMarkers();
  const cutoff = new Date(Date.now() - gracePeriodMs);
  const expired = markers.filter((m) => m.uploadedAt < cutoff);

  let orphansDeleted = 0;
  let markersDeleted = 0;
  let errors = 0;

  for (const marker of expired) {
    try {
      const board = await storage.metadata.getBoard(marker.boardId).catch(() => null);
      const isAttached =
        board?.items.some((item) => isFileItem(item) && item.blob.key === marker.blobUrl) ?? false;

      if (!isAttached) {
        await storage.blobs.delete({ provider: storage.name, key: marker.blobUrl });
        orphansDeleted++;
        logger.info("gc.orphan.deleted", { blobUrl: marker.blobUrl, boardId: marker.boardId });
      }

      await storage.gc.deletePendingMarker(marker.blobUrl);
      markersDeleted++;
    } catch (error) {
      errors++;
      logger.error("gc.orphan.error", { blobUrl: marker.blobUrl, error });
    }
  }

  return { scanned: expired.length, orphansDeleted, markersDeleted, errors };
}
