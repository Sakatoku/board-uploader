import { describe, it, expect, beforeEach, vi } from "vitest";

const listMock = vi.fn();
const putMock = vi.fn();
const delMock = vi.fn();

vi.mock("@vercel/blob", () => ({
  list: (...args: unknown[]) => listMock(...args),
  put: (...args: unknown[]) => putMock(...args),
  del: (...args: unknown[]) => delMock(...args),
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(),
}));

import { VercelBlobStorageProvider } from "./vercel-blob";

const TOKEN = "vercel_blob_rw_storeABC123_secretpart";
const DETERMINISTIC_URL =
  "https://storeABC123.public.blob.vercel-storage.com/boards/board-1.json";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("VercelBlobStorageProvider.getBoard", () => {
  beforeEach(() => {
    listMock.mockReset();
    putMock.mockReset();
    delMock.mockReset();
  });

  it("derives the board URL deterministically and skips list() on a hit", async () => {
    const board = { id: "board-1", items: [] };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(board));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new VercelBlobStorageProvider({ token: TOKEN });
    const result = await provider.metadata.getBoard("board-1");

    expect(result).toEqual(board);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain(DETERMINISTIC_URL);
    expect(listMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("falls back to list() when the deterministic URL 404s", async () => {
    const board = { id: "board-1", items: [] };
    const realUrl = "https://storeABC123.public.blob.vercel-storage.com/boards/board-1-xyz.json";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(jsonResponse(board));
    vi.stubGlobal("fetch", fetchMock);
    listMock.mockResolvedValue({
      blobs: [{ pathname: "boards/board-1.json", url: realUrl }],
    });

    const provider = new VercelBlobStorageProvider({ token: TOKEN });
    const result = await provider.metadata.getBoard("board-1");

    expect(result).toEqual(board);
    expect(listMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain(realUrl);

    vi.unstubAllGlobals();
  });

  it("falls back to list() when the token's store id can't be parsed", async () => {
    const board = { id: "board-1", items: [] };
    const realUrl = "https://storeABC123.public.blob.vercel-storage.com/boards/board-1.json";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(board));
    vi.stubGlobal("fetch", fetchMock);
    listMock.mockResolvedValue({
      blobs: [{ pathname: "boards/board-1.json", url: realUrl }],
    });

    const provider = new VercelBlobStorageProvider({ token: "not-a-vercel-token" });
    const result = await provider.metadata.getBoard("board-1");

    expect(result).toEqual(board);
    expect(listMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("returns null when neither the deterministic URL nor list() find the board", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    listMock.mockResolvedValue({ blobs: [] });

    const provider = new VercelBlobStorageProvider({ token: TOKEN });
    const result = await provider.metadata.getBoard("board-1");

    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });
});
