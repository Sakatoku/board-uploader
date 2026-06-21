// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TextEditDialog } from "./TextEditDialog";

describe("TextEditDialog", () => {
  it("renders nothing when closed", () => {
    render(<TextEditDialog open={false} initialValue="hello" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText("テキストを編集")).toBeNull();
  });

  it("pre-fills the editor with the initial value", () => {
    render(<TextEditDialog open={true} initialValue="hello world" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("hello world");
  });

  it("disables 保存 when the text is cleared", () => {
    render(<TextEditDialog open={true} initialValue="hello" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect((screen.getByText("保存") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onSubmit with the trimmed text", () => {
    const onSubmit = vi.fn();
    render(<TextEditDialog open={true} initialValue="hello" onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  updated text  " } });
    fireEvent.click(screen.getByText("保存"));
    expect(onSubmit).toHaveBeenCalledWith("updated text");
  });

  it("calls onCancel when キャンセル is clicked", () => {
    const onCancel = vi.fn();
    render(<TextEditDialog open={true} initialValue="hello" onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
