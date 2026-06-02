import { describe, it, expect, beforeEach } from "vitest";
import { MockStorageProvider } from "../storage/mock";
import { HttpError } from "../http/errors";
import {
  addFiles,
  addNote,
  createBoard,
  getBoard,
  resolveFile,
  updateItemPosition,
} from "./boards";

let storage: MockStorageProvider;

beforeEach(() => {
  storage = new MockStorageProvider();
});

async function newBoardId(): Promise<string> {
  const { board } = await createBoard(storage, { title: "Test" });
  return board.id;
}

describe("createBoard / getBoard", () => {
  it("creates and retrieves a board", async () => {
    const { board } = await createBoard(storage, { title: "Hi" });
    const fetched = await getBoard(storage, board.id);
    expect(fetched.board.id).toBe(board.id);
    expect(fetched.board.title).toBe("Hi");
  });

  it("throws 404 for an unknown board", async () => {
    await expect(getBoard(storage, "nope")).rejects.toMatchObject({
      statusCode: 404,
    } satisfies Partial<HttpError>);
  });
});

describe("addNote", () => {
  it("appends a note to the board", async () => {
    const boardId = await newBoardId();
    const { item, board } = await addNote(storage, boardId, { text: "hello", x: 10, y: 20 });
    expect(item.type).toBe("note");
    expect(board.items).toHaveLength(1);
  });

  it("rejects empty text", async () => {
    const boardId = await newBoardId();
    await expect(addNote(storage, boardId, { text: "   " })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("addFiles", () => {
  it("stores a blob and creates an image item for image mime types", async () => {
    const boardId = await newBoardId();
    const { items } = await addFiles(
      storage,
      boardId,
      [{ data: Buffer.from("png-bytes"), originalName: "a.png", mimeType: "image/png", size: 9 }],
      { x: 0, y: 0 },
    );
    expect(items[0].type).toBe("image");
    expect(items[0].blob.provider).toBe("mock");

    // The blob must be retrievable through the same provider.
    const read = await storage.blobs.read(items[0].blob);
    expect(read.size).toBe("png-bytes".length);
  });

  it("rejects when no files are provided", async () => {
    const boardId = await newBoardId();
    await expect(addFiles(storage, boardId, [], {})).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe("updateItemPosition", () => {
  it("updates coordinates", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x", x: 0, y: 0 });
    const result = await updateItemPosition(storage, boardId, item.id, { x: 50, y: 60 });
    expect(result.item.x).toBe(50);
    expect(result.item.y).toBe(60);
  });

  it("rejects non-numeric coordinates", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x" });
    await expect(
      updateItemPosition(storage, boardId, item.id, { x: "abc", y: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("404s for unknown item", async () => {
    const boardId = await newBoardId();
    await expect(
      updateItemPosition(storage, boardId, "ghost", { x: 1, y: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("resolveFile", () => {
  it("404s for a note id (not a file)", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x" });
    await expect(resolveFile(storage, boardId, item.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
