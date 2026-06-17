import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend build config. The repo's package.json stays CommonJS (the API
// serverless function depends on it), and that's fine: Vite/esbuild bundles
// this config and the React source, so Node's module resolution is never used
// for the frontend at runtime.
//
// Dev: `vite` serves the React app on :5173 and proxies /api to the local
// Express server (`npm run dev:api`, :3000).
// Build: outputs static assets to dist/, which Vercel serves (see vercel.json).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
