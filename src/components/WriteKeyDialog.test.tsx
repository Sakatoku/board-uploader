// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WriteKeyDialog } from "./WriteKeyDialog";

describe("WriteKeyDialog", () => {
  it("renders nothing when closed", () => {
    render(<WriteKeyDialog open={false} initialValue="" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText("編集キー（書き込み用）")).toBeNull();
  });

  it("masks the value by default", () => {
    render(<WriteKeyDialog open={true} initialValue="secret" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText("編集キーを入力してください。") as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("secret");
  });

  it("reveals the value when 表示 is clicked", () => {
    render(<WriteKeyDialog open={true} initialValue="secret" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("表示"));
    const input = screen.getByPlaceholderText("編集キーを入力してください。") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(screen.getByText("隠す")).toBeTruthy();
  });

  it("calls onSubmit with the current value", () => {
    const onSubmit = vi.fn();
    render(<WriteKeyDialog open={true} initialValue="old" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const input = screen.getByPlaceholderText("編集キーを入力してください。");
    fireEvent.change(input, { target: { value: "new-key" } });
    fireEvent.click(screen.getByText("保存"));
    expect(onSubmit).toHaveBeenCalledWith("new-key");
  });

  it("calls onCancel when キャンセル is clicked", () => {
    const onCancel = vi.fn();
    render(<WriteKeyDialog open={true} initialValue="" onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
