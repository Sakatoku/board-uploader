// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderMarkdown } from "./markdown";

function renderMd(text: string) {
  return render(<div data-testid="root">{renderMarkdown(text)}</div>);
}

describe("renderMarkdown", () => {
  it("renders a plain paragraph", () => {
    const { container } = renderMd("hello world");
    expect(container.querySelector("p")?.textContent).toBe("hello world");
  });

  it("renders headings", () => {
    const { container } = renderMd("# Title\n## Sub\n### Sub sub");
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("h2")?.textContent).toBe("Sub");
    expect(container.querySelector("h3")?.textContent).toBe("Sub sub");
  });

  it("renders a fenced code block verbatim (no inline parsing inside it)", () => {
    const { container } = renderMd("```\nconst x = *1*;\n```");
    expect(container.querySelector("pre code")?.textContent).toBe("const x = *1*;");
  });

  it("renders an unordered list", () => {
    const { container } = renderMd("- one\n- two\n- three");
    const items = container.querySelectorAll("ul li");
    expect(Array.from(items).map((li) => li.textContent)).toEqual(["one", "two", "three"]);
  });

  it("renders an ordered list", () => {
    const { container } = renderMd("1. first\n2. second");
    const ol = container.querySelector("ol");
    expect(ol).toBeTruthy();
    expect(Array.from(ol!.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "first",
      "second",
    ]);
  });

  it("renders a blockquote", () => {
    const { container } = renderMd("> quoted text");
    expect(container.querySelector("blockquote")?.textContent).toBe("quoted text");
  });

  it("renders bold, italic, and inline code", () => {
    const { container } = renderMd("**bold** *italic* `code`");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("renders a safe link with target=_blank", () => {
    const { container } = renderMd("[click here](https://example.com)");
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.textContent).toBe("click here");
  });

  it("does not render a javascript: link as a real anchor", () => {
    const { container } = renderMd("[click](javascript:alert(1))");
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("[click](javascript:alert(1))");
  });

  it("separates multiple paragraphs", () => {
    const { container } = renderMd("first paragraph\n\nsecond paragraph");
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].textContent).toBe("first paragraph");
    expect(paragraphs[1].textContent).toBe("second paragraph");
  });

  it("keeps line breaks within a single paragraph", () => {
    const { container } = renderMd("line one\nline two");
    const p = container.querySelector("p");
    expect(p?.querySelector("br")).toBeTruthy();
    expect(p?.textContent).toBe("line oneline two");
  });
});
