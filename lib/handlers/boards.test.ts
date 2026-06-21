import { describe, it, expect, beforeEach } from "vitest";
import { MockStorageProvider } from "../storage/mock";
import { HttpError } from "../http/errors";
import {
  addFiles,
  addNote,
  attachFiles,
  createBoard,
  deleteItem,
  getBoard,
  resolveFile,
  updateItem,
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

describe("attachFiles (direct-upload path)", () => {
  const blobUrl = "https://store123.public.blob.vercel-storage.com/blobs/a-xyz.png";

  it("records items for already-uploaded blob URLs", async () => {
    const boardId = await newBoardId();
    const { items, board } = await attachFiles(storage, boardId, [
      { url: blobUrl, fileName: "a.png", mimeType: "image/png", size: 1234, x: 40, y: 50 },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("image");
    expect(items[0].blob.key).toBe(blobUrl);
    expect(items[0].blob.provider).toBe("mock");
    expect({ x: items[0].x, y: items[0].y }).toEqual({ x: 40, y: 50 });
    expect(board.items).toHaveLength(1);
  });

  it("rejects URLs that are not on the blob host", async () => {
    const boardId = await newBoardId();
    await expect(
      attachFiles(storage, boardId, [
        { url: "https://evil.example.com/x.png", fileName: "x.png", mimeType: "image/png", size: 1 },
      ]),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects when no files are provided", async () => {
    const boardId = await newBoardId();
    await expect(attachFiles(storage, boardId, [])).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("updateItem", () => {
  it("updates coordinates", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x", x: 0, y: 0 });
    const result = await updateItem(storage, boardId, item.id, { x: 50, y: 60 });
    expect(result.item.x).toBe(50);
    expect(result.item.y).toBe(60);
  });

  it("rejects non-numeric coordinates", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x" });
    await expect(
      updateItem(storage, boardId, item.id, { x: "abc", y: 1 }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("404s for unknown item", async () => {
    const boardId = await newBoardId();
    await expect(
      updateItem(storage, boardId, "ghost", { x: 1, y: 1 }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("renames the item", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x", x: 0, y: 0 });
    const result = await updateItem(storage, boardId, item.id, { title: "  New name  " });
    expect(result.item.title).toBe("New name");
  });

  it("rejects an empty title", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x" });
    await expect(
      updateItem(storage, boardId, item.id, { title: "   " }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects when neither position nor title is provided", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x" });
    await expect(updateItem(storage, boardId, item.id, {})).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("updates position and title together", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "x", x: 0, y: 0 });
    const result = await updateItem(storage, boardId, item.id, { x: 5, y: 5, title: "Renamed" });
    expect(result.item.x).toBe(5);
    expect(result.item.y).toBe(5);
    expect(result.item.title).toBe("Renamed");
  });
});

describe("deleteItem", () => {
  it("removes the item and returns the updated board", async () => {
    const boardId = await newBoardId();
    const { item } = await addNote(storage, boardId, { text: "bye", x: 0, y: 0 });
    const { board } = await deleteItem(storage, boardId, item.id);
    expect(board.items).toHaveLength(0);
  });

  it("throws 404 when the item does not exist", async () => {
    const boardId = await newBoardId();
    await expect(deleteItem(storage, boardId, "nope")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("deletes the blob for a file item", async () => {
    const boardId = await newBoardId();
    const { items } = await addFiles(storage, boardId, [
      { data: Buffer.from("x"), originalName: "a.png", mimeType: "image/png", size: 1 },
    ], {});
    const fileItem = items[0];
    await deleteItem(storage, boardId, fileItem.id);
    await expect(storage.blobs.read(fileItem.blob)).rejects.toThrow();
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
