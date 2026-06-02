/**
 * Local development server.
 *
 * Runs the same Express app used in production, plus static file serving and
 * SPA-style fallback (which Vercel handles via vercel.json in prod). Defaults
 * STORAGE_DRIVER to "mock" so local runs never touch real pCloud data unless
 * you explicitly opt in.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApp } from "./lib/app";
import { logger } from "./lib/logger";

process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || "mock";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;

const app = createApp();
app.use(express.static(PUBLIC_DIR));

// SPA fallback: serve the shell for board routes.
app.get(/^\/(boards\/.*)?$/, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  logger.info("dev.listen", { port: PORT, storage: process.env.STORAGE_DRIVER });
  // Friendly console line for humans, in addition to the structured log.
  console.log(`Board uploader (dev) → http://localhost:${PORT}`);
});
