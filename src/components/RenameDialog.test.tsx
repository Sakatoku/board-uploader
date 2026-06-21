// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RenameDialog } from "./RenameDialog";

describe("RenameDialog", () => {
  it("renders nothing when closed", () => {
    render(<RenameDialog open={false} initialValue="Note" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText("名前を変更")).toBeNull();
  });

  it("pre-fills the input with the initial value", () => {
    render(<RenameDialog open={true} initialValue="Old title" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByDisplayValue("Old title")).toBeTruthy();
  });

  it("disables 保存 when the input is cleared", () => {
    render(<RenameDialog open={true} initialValue="Old title" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByDisplayValue("Old title");
    fireEvent.change(input, { target: { value: "   " } });
    expect((screen.getByText("保存") as HTMLButtonElement).disabled).toBe(true);
  });

  it("calls onSubmit with the trimmed title", () => {
    const onSubmit = vi.fn();
    render(<RenameDialog open={true} initialValue="Old title" onSubmit={onSubmit} onCancel={vi.fn()} />);
    const input = screen.getByDisplayValue("Old title");
    fireEvent.change(input, { target: { value: "  New title  " } });
    fireEvent.click(screen.getByText("保存"));
    expect(onSubmit).toHaveBeenCalledWith("New title");
  });

  it("calls onCancel when キャンセル is clicked", () => {
    const onCancel = vi.fn();
    render(<RenameDialog open={true} initialValue="Old title" onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("キャンセル"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
