import type { StorageProvider } from "../storage/provider";
import { runOrphanGc } from "../gc/orphan";

export async function gcOrphanBlobs(
  storage: StorageProvider,
): Promise<{ gc: Awaited<ReturnType<typeof runOrphanGc>> }> {
  const result = await runOrphanGc(storage);
  return { gc: result };
}
