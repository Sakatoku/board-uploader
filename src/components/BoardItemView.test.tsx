// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BoardItemView } from "./BoardItemView";
import type { NoteItem, FileItem } from "../types";

vi.mock("../lib/api", () => ({
  contentUrl: (boardId: string, itemId: string) => `/api/boards/${boardId}/items/${itemId}/content`,
  downloadUrl: (boardId: string, itemId: string) => `/api/boards/${boardId}/items/${itemId}/download`,
  log: vi.fn(),
}));
vi.mock("../lib/log", () => ({ log: vi.fn() }));

const BOARD_ID = "board-1";
const noop = vi.fn();

function makeNote(overrides: Partial<NoteItem> = {}): NoteItem {
  return {
    id: "note-id",
    type: "note",
    title: "My Note",
    text: "Hello world",
    x: 50,
    y: 80,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeImage(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "img-id",
    type: "image",
    title: "Photo",
    fileName: "photo.png",
    mimeType: "image/png",
    size: 2048,
    x: 100,
    y: 200,
    blob: { provider: "mock", key: "k" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeFile(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "file-id",
    type: "file",
    title: "Doc",
    fileName: "doc.pdf",
    mimeType: "application/pdf",
    size: 1024 * 1024,
    x: 0,
    y: 0,
    blob: { provider: "mock", key: "k" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("BoardItemView", () => {
  describe("note item", () => {
    it("renders the note text", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} />);
      expect(screen.getByText("Hello world")).toBeTruthy();
    });

    it("shows TEXT badge", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} />);
      expect(screen.getByText("TEXT")).toBeTruthy();
    });

    it("renders at the item's x/y position", () => {
      const { container } = render(
        <BoardItemView boardId={BOARD_ID} item={makeNote({ x: 120, y: 240 })} onDragStart={noop} />,
      );
      const article = container.querySelector("article");
      expect(article?.style.left).toBe("120px");
      expect(article?.style.top).toBe("240px");
    });

    it("applies the 'note' CSS class", () => {
      const { container } = render(
        <BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} />,
      );
      expect(container.querySelector("article")?.className).toContain("note");
    });
  });

  describe("image item", () => {
    it("shows IMAGE badge", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage()} onDragStart={noop} />);
      expect(screen.getByText("IMAGE")).toBeTruthy();
    });

    it("renders the image element", () => {
      const { container } = render(
        <BoardItemView boardId={BOARD_ID} item={makeImage()} onDragStart={noop} />,
      );
      expect(container.querySelector("img")).toBeTruthy();
    });

    it("renders the download link", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage({ id: "img-id" })} onDragStart={noop} />);
      const link = screen.getByText("ダウンロード") as HTMLAnchorElement;
      expect(link.href).toContain("/api/boards/board-1/items/img-id/download");
    });

    it("renders the open link for images", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage({ id: "img-id" })} onDragStart={noop} />);
      const link = screen.getByText("開く") as HTMLAnchorElement;
      expect(link.href).toContain("/api/boards/board-1/items/img-id/content");
    });

    it("displays the file name and mime type", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage()} onDragStart={noop} />);
      expect(screen.getByText("photo.png")).toBeTruthy();
      expect(screen.getByText(/image\/png/)).toBeTruthy();
    });

    it("formats size in KB", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage({ size: 2048 })} onDragStart={noop} />);
      expect(screen.getByText(/2\.0 KB/)).toBeTruthy();
    });
  });

  describe("file item (non-image)", () => {
    it("shows FILE badge", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeFile()} onDragStart={noop} />);
      expect(screen.getByText("FILE")).toBeTruthy();
    });

    it("does not render an image element", () => {
      const { container } = render(
        <BoardItemView boardId={BOARD_ID} item={makeFile()} onDragStart={noop} />,
      );
      expect(container.querySelector("img")).toBeNull();
    });

    it("does not render an 開く link", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeFile()} onDragStart={noop} />);
      expect(screen.queryByText("開く")).toBeNull();
    });

    it("formats size in MB", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeFile({ size: 1024 * 1024 })} onDragStart={noop} />);
      expect(screen.getByText(/1\.0 MB/)).toBeTruthy();
    });

    it("formats size in bytes when under 1 KB", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeFile({ size: 512 })} onDragStart={noop} />);
      expect(screen.getByText(/512 B/)).toBeTruthy();
    });
  });
});
