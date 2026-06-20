// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddNoteDialog } from "./AddNoteDialog";

describe("AddNoteDialog", () => {
  it("renders nothing when closed", () => {
    render(<AddNoteDialog open={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText("テキストを追加")).toBeNull();
  });

  it("renders the textarea when open", () => {
    render(<AddNoteDialog open={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByPlaceholderText("追加したいテキストを入力してください。")).toBeTruthy();
  });

  it("disables 追加 until text is entered", () => {
    render(<AddNoteDialog open={true} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const button = screen.getByText("追加") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("calls onSubmit with the trimmed text", () => {
    const onSubmit = vi.fn();
    render(<AddNoteDialog open={true} onSubmit={onSubmit} onCancel={vi.fn()} />);
    const textarea = screen.getByPlaceholderText("追加したいテキストを入力してください。");
    fireEvent.change(textarea, { target: { value: "  hello  " } });
    fireEvent.click(screen.getByText("追加"));
    expect(onSubmit).toHaveBeenCalledWith("hello");
  });

  it("does not submit empty text", () => {
    const onSubmit = vi.fn();
    render(<AddNoteDialog open={true} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("追加"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onCancel when キャンセル is clicked", () => {
    const onCancel = vi.fn();
    render(<AddNoteDialog open={true} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
