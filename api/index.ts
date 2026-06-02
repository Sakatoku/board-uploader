/**
 * Vercel serverless entry point.
 *
 * Vercel turns this file into a function and accepts an Express app as the
 * default export. `vercel.json` rewrites every /api/* request here; static
 * assets and the SPA fallback are handled by Vercel's CDN config.
 */

import { createApp } from "../lib/app";

export default createApp();
