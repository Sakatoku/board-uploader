/**
 * Local API server for development.
 *
 * Runs the same Express app used in production (the /api/* routes only). The
 * React frontend is served separately by Vite (`npm run dev:web`, :5173), which
 * proxies /api to this server. Defaults STORAGE_DRIVER to "mock" so local runs
 * never touch real storage unless you explicitly opt in.
 */

import { createApp } from "./lib/app";
import { logger } from "./lib/logger";

process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || "mock";

const PORT = Number(process.env.PORT) || 3000;

const app = createApp();

app.listen(PORT, () => {
  logger.info("dev.listen", { port: PORT, storage: process.env.STORAGE_DRIVER });
  // Friendly console line for humans, in addition to the structured log.
  console.log(`Board uploader API (dev) → http://localhost:${PORT}`);
  console.log(`Frontend (Vite): run \`npm run dev:web\` → http://localhost:5173`);
});
