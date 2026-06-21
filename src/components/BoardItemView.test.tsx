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

function makeVideo(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "video-id",
    type: "video",
    title: "Movie",
    fileName: "movie.mp4",
    mimeType: "video/mp4",
    size: 10 * 1024 * 1024,
    x: 0, y: 0,
    blob: { provider: "mock", key: "k" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeAudio(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "audio-id",
    type: "audio",
    title: "Track",
    fileName: "track.mp3",
    mimeType: "audio/mpeg",
    size: 3 * 1024 * 1024,
    x: 0, y: 0,
    blob: { provider: "mock", key: "k" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePdf(overrides: Partial<FileItem> = {}): FileItem {
  return {
    id: "pdf-id",
    type: "pdf",
    title: "Document",
    fileName: "doc.pdf",
    mimeType: "application/pdf",
    size: 512 * 1024,
    x: 0, y: 0,
    blob: { provider: "mock", key: "k" },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("video item", () => {
  it("shows the video badge icon", () => {
    render(<BoardItemView boardId={BOARD_ID} item={makeVideo()} onDragStart={noop} onDelete={noop} onRename={noop} />);
    expect(screen.getByLabelText("動画")).toBeTruthy();
  });

  it("renders a video element", () => {
    const { container } = render(
      <BoardItemView boardId={BOARD_ID} item={makeVideo({ id: "video-id" })} onDragStart={noop} onDelete={noop} onRename={noop} />,
    );
    const video = container.querySelector("video");
    expect(video).toBeTruthy();
    expect(video?.src).toContain("/api/boards/board-1/items/video-id/content");
  });

  it("renders the 開く link", () => {
    render(<BoardItemView boardId={BOARD_ID} item={makeVideo({ id: "video-id" })} onDragStart={noop} onDelete={noop} onRename={noop} />);
    expect(screen.getByText("開く")).toBeTruthy();
  });

  it("renders the download link", () => {
    render(<BoardItemView boardId={BOARD_ID} item={makeVideo({ id: "video-id" })} onDragStart={noop} onDelete={noop} onRename={noop} />);
    expect(screen.getByText("ダウンロード")).toBeTruthy();
  });
});

describe("audio item", () => {
  it("shows the audio badge icon", () => {
    render(<BoardItemView boardId={BOARD_ID} item={makeAudio()} onDragStart={noop} onDelete={noop} onRename={noop} />);
    expect(screen.getByLabelText("音声")).toBeTruthy();
  });

  it("renders an audio element", () => {
    const { container } = render(
      <BoardItemView boardId={BOARD_ID} item={makeAudio({ id: "audio-id" })} onDragStart={noop} onDelete={noop} onRename={noop} />,
    );
    const audio = container.querySelector("audio");
    expect(audio).toBeTruthy();
    expect(audio?.src).toContain("/api/boards/board-1/items/audio-id/content");
  });

  it("does not render the 開く link", () => {
    render(<BoardItemView boardId={BOARD_ID} item={makeAudio()} onDragStart={noop} onDelete={noop} onRename={noop} />);
    expect(screen.queryByText("開く")).toBeNull();
  });
});

describe("pdf item", () => {
  it("shows the pdf badge icon", () => {
    render(<BoardItemView boardId={BOARD_ID} item={makePdf()} onDragStart={noop} onDelete={noop} onRename={noop} />);
    expect(screen.getByLabelText("PDF")).toBeTruthy();
  });

  it("renders an iframe", () => {
    const { container } = render(
      <BoardItemView boardId={BOARD_ID} item={makePdf({ id: "pdf-id" })} onDragStart={noop} onDelete={noop} onRename={noop} />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.src).toContain("/api/boards/board-1/items/pdf-id/content");
  });

  it("renders the 開く link", () => {
    render(<BoardItemView boardId={BOARD_ID} item={makePdf({ id: "pdf-id" })} onDragStart={noop} onDelete={noop} onRename={noop} />);
    expect(screen.getByText("開く")).toBeTruthy();
  });
});

describe("delete button", () => {
  it("renders a delete button on every item", () => {
    const { container } = render(
      <BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} onDelete={noop} onRename={noop} />,
    );
    expect(container.querySelector(".item-delete")).toBeTruthy();
  });

  it("calls onDelete with item id after confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    const onDelete = vi.fn();
    render(
      <BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} onDelete={onDelete} onRename={noop} />,
    );
    const btn = document.querySelector(".item-delete") as HTMLElement;
    btn.click();
    expect(onDelete).toHaveBeenCalledWith(makeNote().id);
  });

  it("does not call onDelete when confirm is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    const onDelete = vi.fn();
    render(
      <BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} onDelete={onDelete} onRename={noop} />,
    );
    (document.querySelector(".item-delete") as HTMLElement).click();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe("rename button", () => {
  it("renders a rename button on every item", () => {
    const { container } = render(
      <BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} onDelete={noop} onRename={noop} />,
    );
    expect(container.querySelector(".item-rename")).toBeTruthy();
  });

  it("calls onRename with the item when clicked", () => {
    const onRename = vi.fn();
    const note = makeNote();
    render(
      <BoardItemView boardId={BOARD_ID} item={note} onDragStart={noop} onDelete={noop} onRename={onRename} />,
    );
    (document.querySelector(".item-rename") as HTMLElement).click();
    expect(onRename).toHaveBeenCalledWith(note);
  });
});

describe("BoardItemView", () => {
  describe("note item", () => {
    it("renders the note text", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.getByText("Hello world")).toBeTruthy();
    });

    it("shows the text badge icon", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.getByLabelText("テキスト")).toBeTruthy();
    });

    it("renders at the item's x/y position", () => {
      const { container } = render(
        <BoardItemView boardId={BOARD_ID} item={makeNote({ x: 120, y: 240 })} onDragStart={noop} onDelete={noop} onRename={noop} />,
      );
      const article = container.querySelector("article");
      expect(article?.style.left).toBe("120px");
      expect(article?.style.top).toBe("240px");
    });

    it("applies the 'note' CSS class", () => {
      const { container } = render(
        <BoardItemView boardId={BOARD_ID} item={makeNote()} onDragStart={noop} onDelete={noop} onRename={noop} />,
      );
      expect(container.querySelector("article")?.className).toContain("note");
    });
  });

  describe("image item", () => {
    it("shows the image badge icon", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage()} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.getByLabelText("画像")).toBeTruthy();
    });

    it("renders the image element", () => {
      const { container } = render(
        <BoardItemView boardId={BOARD_ID} item={makeImage()} onDragStart={noop} onDelete={noop} onRename={noop} />,
      );
      expect(container.querySelector("img")).toBeTruthy();
    });

    it("renders the download link", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage({ id: "img-id" })} onDragStart={noop} onDelete={noop} onRename={noop} />);
      const link = screen.getByText("ダウンロード") as HTMLAnchorElement;
      expect(link.href).toContain("/api/boards/board-1/items/img-id/download");
    });

    it("renders the open link for images", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage({ id: "img-id" })} onDragStart={noop} onDelete={noop} onRename={noop} />);
      const link = screen.getByText("開く") as HTMLAnchorElement;
      expect(link.href).toContain("/api/boards/board-1/items/img-id/content");
    });

    it("displays the file name and mime type", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage()} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.getByText("photo.png")).toBeTruthy();
      expect(screen.getByText(/image\/png/)).toBeTruthy();
    });

    it("formats size in KB", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeImage({ size: 2048 })} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.getByText(/2\.0 KB/)).toBeTruthy();
    });
  });

  describe("file item (non-image)", () => {
    it("shows the file badge icon", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeFile()} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.getByLabelText("ファイル")).toBeTruthy();
    });

    it("does not render an image element", () => {
      const { container } = render(
        <BoardItemView boardId={BOARD_ID} item={makeFile()} onDragStart={noop} onDelete={noop} onRename={noop} />,
      );
      expect(container.querySelector("img")).toBeNull();
    });

    it("does not render an 開く link", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeFile()} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.queryByText("開く")).toBeNull();
    });

    it("formats size in MB", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeFile({ size: 1024 * 1024 })} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.getByText(/1\.0 MB/)).toBeTruthy();
    });

    it("formats size in bytes when under 1 KB", () => {
      render(<BoardItemView boardId={BOARD_ID} item={makeFile({ size: 512 })} onDragStart={noop} onDelete={noop} onRename={noop} />);
      expect(screen.getByText(/512 B/)).toBeTruthy();
    });
  });
});
