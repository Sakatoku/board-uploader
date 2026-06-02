import { describe, it, expect } from "vitest";
import {
  makeBoard,
  normalizeTitle,
  toFiniteNumber,
  serializeBoard,
  LIMITS,
} from "./board";

describe("normalizeTitle", () => {
  it("trims and returns valid titles", () => {
    expect(normalizeTitle("  hello  ")).toBe("hello");
  });

  it("returns null for blank or non-string input", () => {
    expect(normalizeTitle("   ")).toBeNull();
    expect(normalizeTitle(42)).toBeNull();
    expect(normalizeTitle(undefined)).toBeNull();
  });

  it("caps length at the configured maximum", () => {
    const long = "x".repeat(LIMITS.titleMaxLength + 50);
    expect(normalizeTitle(long)).toHaveLength(LIMITS.titleMaxLength);
  });
});

describe("toFiniteNumber", () => {
  it("parses numeric strings", () => {
    expect(toFiniteNumber("12.5", 0)).toBe(12.5);
  });

  it("passes through finite numbers", () => {
    expect(toFiniteNumber(7, 0)).toBe(7);
  });

  it("falls back for NaN / Infinity / garbage", () => {
    expect(toFiniteNumber("abc", 99)).toBe(99);
    expect(toFiniteNumber(Infinity, 99)).toBe(99);
    expect(toFiniteNumber(undefined, 99)).toBe(99);
  });
});

describe("makeBoard", () => {
  it("defaults the title when none is given", () => {
    expect(makeBoard().title).toBe("Untitled board");
  });

  it("uses a provided title", () => {
    expect(makeBoard("My board").title).toBe("My board");
  });
});

describe("serializeBoard", () => {
  it("orders items oldest-first by createdAt", () => {
    const board = makeBoard();
    board.items = [
      { ...stubNote("b"), createdAt: "2026-01-02T00:00:00.000Z" },
      { ...stubNote("a"), createdAt: "2026-01-01T00:00:00.000Z" },
    ];
    const ordered = serializeBoard(board).items.map((i) => i.id);
    expect(ordered).toEqual(["a", "b"]);
  });
});

function stubNote(id: string) {
  return {
    id,
    type: "note" as const,
    title: "Text note",
    text: "x",
    x: 0,
    y: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
