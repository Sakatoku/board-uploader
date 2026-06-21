// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LineNumberedEditor } from "./LineNumberedEditor";

describe("LineNumberedEditor", () => {
  it("shows one gutter line number per text line", () => {
    const { container } = render(<LineNumberedEditor value={"a\nb\nc"} onChange={vi.fn()} />);
    const gutterLines = container.querySelectorAll(".line-editor-gutter > div");
    expect(Array.from(gutterLines).map((el) => el.textContent)).toEqual(["1", "2", "3"]);
  });

  it("shows a single line number for empty text", () => {
    const { container } = render(<LineNumberedEditor value="" onChange={vi.fn()} />);
    const gutterLines = container.querySelectorAll(".line-editor-gutter > div");
    expect(gutterLines.length).toBe(1);
  });

  it("calls onChange with the new value", () => {
    const onChange = vi.fn();
    render(<LineNumberedEditor value="a" onChange={onChange} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "a\nb" } });
    expect(onChange).toHaveBeenCalledWith("a\nb");
  });

  it("disables wrapping so gutter lines stay 1:1 with text lines", () => {
    render(<LineNumberedEditor value="a" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.getAttribute("wrap")).toBe("off");
  });
});
