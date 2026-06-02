/**
 * The Express application.
 *
 * This single app is the *only* HTTP surface. It runs verbatim in two places:
 *   - locally via dev-server.ts (`npm run dev`)
 *   - on Vercel via api/index.ts (exported as the serverless handler)
 *
 * One code path = fewer "works locally, breaks in prod" surprises. Route
 * handlers are intentionally thin: they parse the request, delegate to the
 * framework-agnostic handlers in lib/handlers, and serialise the result.
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { getStorage } from "./storage";
import { HttpError } from "./http/errors";
import {
  addFiles,
  addNote,
  createBoard,
  getBoard,
  resolveFile,
  updateItemPosition,
  type UploadedFile,
} from "./handlers/boards";
import { logger } from "./logger";

// Memory storage: multer hands us Buffers we forward straight to the BlobStore.
// NOTE: Vercel functions cap request bodies at ~4.5MB on the Free tier. Large
// uploads need a direct-to-pCloud path (tracked for a later increment).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 20, fileSize: 50 * 1024 * 1024 },
});

/** Wrap an async route so thrown errors reach the error middleware. */
function wrap(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}

/** Read a route param as a single string (Express 5 types it as string|string[]). */
function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function multerFilesToUploads(req: Request): UploadedFile[] {
  const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
  return files.map((file) => ({
    data: file.buffer,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  }));
}

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", wrap(async (_req, res) => {
    const health = await getStorage().health();
    res.status(health.ok ? 200 : 503).json(health);
  }));

  app.post("/api/boards", wrap(async (req, res) => {
    const result = await createBoard(getStorage(), { title: req.body?.title });
    res.status(201).json(result);
  }));

  app.get("/api/boards/:boardId", wrap(async (req, res) => {
    res.json(await getBoard(getStorage(), param(req, "boardId")));
  }));

  app.post("/api/boards/:boardId/notes", wrap(async (req, res) => {
    const result = await addNote(getStorage(), param(req, "boardId"), {
      text: req.body?.text,
      x: req.body?.x,
      y: req.body?.y,
    });
    res.status(201).json(result);
  }));

  app.post(
    "/api/boards/:boardId/files",
    upload.array("files", 20),
    wrap(async (req, res) => {
      const result = await addFiles(
        getStorage(),
        param(req, "boardId"),
        multerFilesToUploads(req),
        { x: req.body?.x, y: req.body?.y },
      );
      res.status(201).json(result);
    }),
  );

  app.patch("/api/boards/:boardId/items/:itemId", wrap(async (req, res) => {
    const result = await updateItemPosition(
      getStorage(),
      param(req, "boardId"),
      param(req, "itemId"),
      { x: req.body?.x, y: req.body?.y },
    );
    res.json(result);
  }));

  // File serving. Routes carry the boardId so we never need a global asset
  // index: the board document already knows where each item's blob lives.
  app.get("/api/boards/:boardId/items/:itemId/content", wrap(async (req, res) => {
    await serveFile(req, res, { asDownload: false });
  }));

  app.get("/api/boards/:boardId/items/:itemId/download", wrap(async (req, res) => {
    await serveFile(req, res, { asDownload: true });
  }));

  app.use(errorMiddleware);
  return app;
}

async function serveFile(
  req: Request,
  res: Response,
  options: { asDownload: boolean },
): Promise<void> {
  const { item, directUrl } = await resolveFile(
    getStorage(),
    param(req, "boardId"),
    param(req, "itemId"),
  );

  // Prefer redirecting to the storage backend's own URL: this offloads
  // bandwidth from the serverless function (important on Vercel Free).
  if (directUrl) {
    res.redirect(302, directUrl);
    return;
  }

  const blob = await getStorage().blobs.read(item.blob);
  res.type(item.mimeType || blob.contentType);
  if (options.asDownload) {
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(item.fileName)}"`,
    );
  }
  blob.stream.pipe(res);
}

function errorMiddleware(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";

  // 5xx are unexpected — log with full detail so we can diagnose from logs.
  if (statusCode >= 500) {
    logger.error("request.error", {
      method: req.method,
      path: req.path,
      statusCode,
      error,
    });
  } else {
    logger.warn("request.rejected", {
      method: req.method,
      path: req.path,
      statusCode,
      message,
    });
  }

  res.status(statusCode).json({ error: message });
}
