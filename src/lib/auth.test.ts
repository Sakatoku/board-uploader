// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildKeyTransferUrl,
  consumeKeyFromLocation,
  getWriteKey,
  hasWriteKey,
  setWriteKey,
} from "./auth";

function resetLocation(path = "/boards/abc"): void {
  window.history.replaceState(null, "", path);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetLocation();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getWriteKey/setWriteKey", () => {
  it("round-trips through localStorage", () => {
    setWriteKey("secret-key");
    expect(getWriteKey()).toBe("secret-key");
    expect(localStorage.getItem("board-uploader:write-key")).toBe("secret-key");
  });

  it("trims whitespace and clears on empty input", () => {
    setWriteKey("  spaced-key  ");
    expect(getWriteKey()).toBe("spaced-key");
    setWriteKey("   ");
    expect(getWriteKey()).toBe("");
    expect(hasWriteKey()).toBe(false);
  });

  it("falls back to sessionStorage when localStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (this === localStorage) throw new Error("blocked");
      return key === "board-uploader:write-key" ? "session-key" : null;
    });
    expect(getWriteKey()).toBe("session-key");
  });

  it("falls back to an in-memory value when no storage is available at all", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setWriteKey("memory-only-key");
    expect(getWriteKey()).toBe("memory-only-key");
  });
});

describe("buildKeyTransferUrl / consumeKeyFromLocation", () => {
  it("builds a URL carrying the current key in the #wk= fragment", () => {
    setWriteKey("share-me");
    const url = buildKeyTransferUrl();
    expect(url).toContain("#wk=share-me");
    expect(url).toContain("/boards/abc");
  });

  it("URL-encodes special characters in the key", () => {
    setWriteKey("a&b=c");
    const url = buildKeyTransferUrl();
    expect(url).toContain(`#wk=${encodeURIComponent("a&b=c")}`);
  });

  it("picks up a key from the #wk= fragment and strips it from the URL", () => {
    setWriteKey("");
    window.history.replaceState(null, "", "/boards/abc#wk=scanned-key");
    consumeKeyFromLocation();
    expect(getWriteKey()).toBe("scanned-key");
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/boards/abc");
  });

  it("does nothing when there is no #wk= fragment", () => {
    setWriteKey("existing-key");
    window.history.replaceState(null, "", "/boards/abc#somethingelse");
    consumeKeyFromLocation();
    expect(getWriteKey()).toBe("existing-key");
    expect(window.location.hash).toBe("#somethingelse");
  });
});
