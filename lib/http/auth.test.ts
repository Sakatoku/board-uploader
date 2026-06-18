import { describe, it, expect, afterEach } from "vitest";
import { isWriteAuthorized, writeProtectionEnabled } from "./auth";

const ORIGINAL = process.env.WRITE_API_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.WRITE_API_KEY;
  } else {
    process.env.WRITE_API_KEY = ORIGINAL;
  }
});

describe("write protection gate", () => {
  it("fails open when no key is configured", () => {
    delete process.env.WRITE_API_KEY;
    expect(writeProtectionEnabled()).toBe(false);
    expect(isWriteAuthorized(undefined)).toBe(true);
    expect(isWriteAuthorized("anything")).toBe(true);
  });

  it("enforces the key when configured", () => {
    process.env.WRITE_API_KEY = "s3cret";
    expect(writeProtectionEnabled()).toBe(true);
    expect(isWriteAuthorized("s3cret")).toBe(true);
    expect(isWriteAuthorized("wrong")).toBe(false);
    expect(isWriteAuthorized(undefined)).toBe(false);
    expect(isWriteAuthorized(null)).toBe(false);
  });

  it("rejects keys of a different length without throwing", () => {
    process.env.WRITE_API_KEY = "abcdef";
    expect(isWriteAuthorized("abc")).toBe(false);
    expect(isWriteAuthorized("abcdefghij")).toBe(false);
  });
});
