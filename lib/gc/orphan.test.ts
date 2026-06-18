import { describe, it, expect, beforeEach, vi } from "vitest";
import { runOrphanGc } from "./orphan";
import type { GcStore, PendingMarkerInfo, StorageProvider } from "../storage/provider";
import { MockStorageProvider } from "../storage/mock";

// --- helpers ---

function makeMarker(blobUrl: string, boardId: string, ageMs: number): PendingMarkerInfo {
  return { blobUrl, boardId, uploadedAt: new Date(Date.now() - ageMs) };
}

const GRACE = 10 * 60 * 1000; // 10 min

// A minimal GcStore backed by an in-memory map.
function makeMockGcStore(initial: PendingMarkerInfo[] = []): GcStore & {
  markers: Map<string, PendingMarkerInfo>;
} {
  const markers = new Map(initial.map((m) => [m.blobUrl, m]));
  return {
    markers,
    putPendingMarker: async ({ blobUrl, boardId }) => {
      markers.set(blobUrl, { blobUrl, boardId, uploadedAt: new Date() });
    },
    deletePendingMarker: async (blobUrl) => {
      markers.delete(blobUrl);
    },
    listPendingMarkers: async () => [...markers.values()],
  };
}

function makeStorageWithGc(
  gcStore: GcStore,
  base: MockStorageProvider = new MockStorageProvider(),
): StorageProvider {
  return Object.assign(base, { gc: gcStore });
}

// --- tests ---

describe("runOrphanGc", () => {
  let base: MockStorageProvider;

  beforeEach(() => {
    base = new MockStorageProvider();
  });

  it("GcStore なし → 即リターン (scanned=0)", async () => {
    const result = await runOrphanGc(base);
    expect(result).toEqual({ scanned: 0, orphansDeleted: 0, markersDeleted: 0, errors: 0 });
  });

  it("grace period 内のマーカー → スキップ", async () => {
    const gc = makeMockGcStore([makeMarker("https://example.com/blob/a.jpg", "board-1", GRACE - 1000)]);
    const storage = makeStorageWithGc(gc, base);
    const result = await runOrphanGc(storage, { gracePeriodMs: GRACE });
    expect(result).toEqual({ scanned: 0, orphansDeleted: 0, markersDeleted: 0, errors: 0 });
    expect(gc.markers.size).toBe(1); // marker still present
  });

  it("期限切れ + 未 attach → blob 削除 + marker 削除", async () => {
    const blobUrl = "https://example.com/blob/orphan.jpg";
    const gc = makeMockGcStore([makeMarker(blobUrl, "board-1", GRACE + 1000)]);
    const storage = makeStorageWithGc(gc, base);
    // board-1 exists but has no items
    await base.metadata.putBoard({ id: "board-1", title: "t", createdAt: "", updatedAt: "", items: [] });

    const blobDeleteSpy = vi.spyOn(base.blobs, "delete");
    const result = await runOrphanGc(storage, { gracePeriodMs: GRACE });

    expect(result).toEqual({ scanned: 1, orphansDeleted: 1, markersDeleted: 1, errors: 0 });
    expect(blobDeleteSpy).toHaveBeenCalledWith({ provider: "mock", key: blobUrl });
    expect(gc.markers.size).toBe(0);
  });

  it("期限切れ + attach 済み → marker のみ削除, blob は残る", async () => {
    const blobUrl = "https://example.com/blob/attached.jpg";
    const gc = makeMockGcStore([makeMarker(blobUrl, "board-1", GRACE + 1000)]);
    const storage = makeStorageWithGc(gc, base);
    await base.metadata.putBoard({
      id: "board-1",
      title: "t",
      createdAt: "",
      updatedAt: "",
      items: [
        {
          id: "item-1",
          type: "image",
          title: "pic",
          x: 0,
          y: 0,
          createdAt: "",
          updatedAt: "",
          fileName: "attached.jpg",
          mimeType: "image/jpeg",
          size: 100,
          blob: { provider: "mock", key: blobUrl },
        },
      ],
    });

    const blobDeleteSpy = vi.spyOn(base.blobs, "delete");
    const result = await runOrphanGc(storage, { gracePeriodMs: GRACE });

    expect(result).toEqual({ scanned: 1, orphansDeleted: 0, markersDeleted: 1, errors: 0 });
    expect(blobDeleteSpy).not.toHaveBeenCalled();
    expect(gc.markers.size).toBe(0);
  });

  it("board が存在しない → blob 削除 + marker 削除", async () => {
    const blobUrl = "https://example.com/blob/noboard.jpg";
    const gc = makeMockGcStore([makeMarker(blobUrl, "board-gone", GRACE + 1000)]);
    const storage = makeStorageWithGc(gc, base);
    // board-gone は putBoard していないので getBoard → null

    const blobDeleteSpy = vi.spyOn(base.blobs, "delete");
    const result = await runOrphanGc(storage, { gracePeriodMs: GRACE });

    expect(result).toEqual({ scanned: 1, orphansDeleted: 1, markersDeleted: 1, errors: 0 });
    expect(blobDeleteSpy).toHaveBeenCalledWith({ provider: "mock", key: blobUrl });
    expect(gc.markers.size).toBe(0);
  });

  it("blob.delete 失敗 → errors++ してもループ継続", async () => {
    const blobA = "https://example.com/blob/a.jpg";
    const blobB = "https://example.com/blob/b.jpg";
    const gc = makeMockGcStore([
      makeMarker(blobA, "board-1", GRACE + 1000),
      makeMarker(blobB, "board-1", GRACE + 1000),
    ]);
    const storage = makeStorageWithGc(gc, base);
    await base.metadata.putBoard({ id: "board-1", title: "t", createdAt: "", updatedAt: "", items: [] });

    // Fail only for blobA
    vi.spyOn(base.blobs, "delete").mockImplementation(async (ref) => {
      if (ref.key === blobA) throw new Error("storage error");
    });

    const result = await runOrphanGc(storage, { gracePeriodMs: GRACE });

    expect(result.scanned).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.orphansDeleted).toBe(1);
    // blobA's marker is NOT deleted (error path doesn't reach deletePendingMarker)
    expect(gc.markers.has(blobA)).toBe(true);
    expect(gc.markers.has(blobB)).toBe(false);
  });
});
