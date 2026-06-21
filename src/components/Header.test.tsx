// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "./Header";

const baseProps = {
  onFiles: vi.fn(),
  onAddNote: vi.fn(),
  onToggleDebug: vi.fn(),
  debugOpen: false,
  onCopyLink: vi.fn(),
  writeProtected: false,
  keySet: false,
  onEditKey: vi.fn(),
  placeAtCenter: false,
  onTogglePlaceAtCenter: vi.fn(),
};

describe("Header", () => {
  it("renders the brand name", () => {
    render(<Header {...baseProps} />);
    expect(screen.getByText("BOARD UPLOADER")).toBeTruthy();
  });

  it("renders fixed action buttons", () => {
    render(<Header {...baseProps} />);
    expect(screen.getByText("テキスト追加")).toBeTruthy();
    expect(screen.getByText("共有URLをコピー")).toBeTruthy();
  });

  it("hides the debug button when showDebug is false (default)", () => {
    render(<Header {...baseProps} />);
    expect(screen.queryByText("デバッグ表示")).toBeNull();
    expect(screen.queryByText("デバッグ非表示")).toBeNull();
  });

  it("shows 'デバッグ表示' when showDebug=true and debugOpen is false", () => {
    render(<Header {...baseProps} showDebug={true} debugOpen={false} />);
    expect(screen.getByText("デバッグ表示")).toBeTruthy();
  });

  it("shows 'デバッグ非表示' when showDebug=true and debugOpen is true", () => {
    render(<Header {...baseProps} showDebug={true} debugOpen={true} />);
    expect(screen.getByText("デバッグ非表示")).toBeTruthy();
  });

  it("hides the key button when writeProtected is false", () => {
    render(<Header {...baseProps} writeProtected={false} />);
    expect(screen.queryByText(/編集キー/)).toBeNull();
  });

  it("shows unlocked key button when writeProtected=true and keySet=true", () => {
    render(<Header {...baseProps} writeProtected={true} keySet={true} />);
    const btn = screen.getByText("🔓 編集キー");
    expect(btn).toBeTruthy();
    expect((btn as HTMLElement).className).not.toContain("warn");
  });

  it("shows locked key button with warn class when writeProtected=true and keySet=false", () => {
    render(<Header {...baseProps} writeProtected={true} keySet={false} />);
    const btn = screen.getByText("🔒 編集キー必須");
    expect(btn).toBeTruthy();
    expect((btn as HTMLElement).className).toContain("warn");
  });

  it("calls onAddNote when テキスト追加 is clicked", () => {
    const onAddNote = vi.fn();
    render(<Header {...baseProps} onAddNote={onAddNote} />);
    fireEvent.click(screen.getByText("テキスト追加"));
    expect(onAddNote).toHaveBeenCalledOnce();
  });

  it("calls onCopyLink when 共有URLをコピー is clicked", () => {
    const onCopyLink = vi.fn();
    render(<Header {...baseProps} onCopyLink={onCopyLink} />);
    fireEvent.click(screen.getByText("共有URLをコピー"));
    expect(onCopyLink).toHaveBeenCalledOnce();
  });

  it("calls onToggleDebug when the debug button is clicked", () => {
    const onToggleDebug = vi.fn();
    render(<Header {...baseProps} showDebug={true} onToggleDebug={onToggleDebug} />);
    fireEvent.click(screen.getByText("デバッグ表示"));
    expect(onToggleDebug).toHaveBeenCalledOnce();
  });

  it("calls onEditKey when the key button is clicked", () => {
    const onEditKey = vi.fn();
    render(<Header {...baseProps} writeProtected={true} keySet={true} onEditKey={onEditKey} />);
    fireEvent.click(screen.getByText("🔓 編集キー"));
    expect(onEditKey).toHaveBeenCalledOnce();
  });

  it("shows the cursor-position label when placeAtCenter is false", () => {
    render(<Header {...baseProps} placeAtCenter={false} />);
    const btn = screen.getByText("📍 カーソル位置に追加");
    expect(btn).toBeTruthy();
    expect((btn as HTMLElement).className).not.toContain("active");
  });

  it("shows the viewport-center label and active class when placeAtCenter is true", () => {
    render(<Header {...baseProps} placeAtCenter={true} />);
    const btn = screen.getByText("📍 画面中心に追加");
    expect(btn).toBeTruthy();
    expect((btn as HTMLElement).className).toContain("active");
  });

  it("calls onTogglePlaceAtCenter when the placement toggle is clicked", () => {
    const onTogglePlaceAtCenter = vi.fn();
    render(<Header {...baseProps} onTogglePlaceAtCenter={onTogglePlaceAtCenter} />);
    fireEvent.click(screen.getByText("📍 カーソル位置に追加"));
    expect(onTogglePlaceAtCenter).toHaveBeenCalledOnce();
  });
});
