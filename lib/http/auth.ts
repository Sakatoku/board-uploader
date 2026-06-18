/**
 * Stage-1 write protection: a single shared key gates mutating requests while
 * reads stay open (the link-share model). Reversible and fail-open by design —
 * when WRITE_API_KEY is unset the gate is disabled, so local dev and any
 * already-running deployment keep working until the key is configured.
 *
 * Stage 2 (JWT cookie + QR one-time token) layers on top of this later.
 */

import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger";

const WRITE_KEY_HEADER = "x-api-key";

/** Constant-time string compare; false (without leaking length) on mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** True when a write key is configured (and therefore enforced). */
export function writeProtectionEnabled(): boolean {
  return Boolean(process.env.WRITE_API_KEY);
}

/**
 * Authorize a write. Fail-open: returns true when no key is configured.
 * Used both by the header middleware and the direct-upload clientPayload check.
 */
export function isWriteAuthorized(provided: string | null | undefined): boolean {
  const expected = process.env.WRITE_API_KEY;
  if (!expected) {
    return true;
  }
  return typeof provided === "string" && safeEqual(provided, expected);
}

/** Express middleware guarding mutating routes via the X-API-Key header. */
export function requireWriteKey(req: Request, res: Response, next: NextFunction): void {
  if (isWriteAuthorized(req.header(WRITE_KEY_HEADER))) {
    next();
    return;
  }
  logger.warn("auth.write.denied", { method: req.method, path: req.path });
  res.status(401).json({ error: "A valid write key is required." });
}
