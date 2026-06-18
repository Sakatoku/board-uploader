# Deployment runbook

Board Uploader is a Vite + React frontend plus an Express serverless API:

- `vite build` compiles the React app (`src/`) to `dist/`, which Vercel serves
  as static assets (`buildCommand` / `outputDirectory` in `vercel.json`).
- `api/index.ts` is the serverless function handling every `/api/*` route.
- Storage is pluggable via `STORAGE_DRIVER`; production uses **Vercel Blob**.
- CI (`.github/workflows/ci.yml`) typechecks, tests and builds on every
  push/PR. It runs **in parallel** with Vercel's deploy (a soft gate today, not
  a hard block) — see ROADMAP for the planned PR + preview-deploy flow.

> **Do not add `"type":"module"` to `package.json`.** The API function is
> CommonJS; ESM breaks it on Vercel (`ERR_MODULE_NOT_FOUND`). The React source
> is ESM but bundled by Vite, so it is unaffected.

## 1. One-time Vercel setup (CLI)

```sh
npm i -g vercel
vercel login            # interactive — complete in your browser
vercel link --yes       # link this folder to a Vercel project
```

## 2. Connect a Blob store

Create a Blob store and attach it to the project. The connection injects
`BLOB_READ_WRITE_TOKEN` into the project's environment automatically.

- Dashboard: Project → **Storage** → Create / Connect → **Blob**.
- (Or CLI, if available in your version: `vercel blob store add board-uploader`.)

Then set the storage driver for every environment:

```sh
vercel env add STORAGE_DRIVER production   # value: vercel-blob
vercel env add STORAGE_DRIVER preview      # value: vercel-blob
```

## 3. Validate the backend locally (recommended before relying on it)

Storage providers perform irreversible ops (overwrite, delete). Validate the
real backend in isolation first — it creates a throwaway board + blob, reads
them back, then deletes them:

```sh
vercel env pull .env.local      # pulls BLOB_READ_WRITE_TOKEN locally
# copy BLOB_READ_WRITE_TOKEN into .env and set STORAGE_DRIVER=vercel-blob
npm run check:storage
```

Expect `Storage integration check (vercel-blob): PASS`. On failure, the
structured logs above the error pinpoint which call broke and why.

## 4. Deploy

Optionally verify the production build locally first:

```sh
npm run build        # vite build → dist/
```

Then deploy (Vercel runs `vite build` via `vercel.json` `buildCommand`):

```sh
vercel --prod
```

Subsequent deploys can be wired to GitHub pushes by importing the repo in the
dashboard, or run `vercel --prod` again.

## 5. Verify the live deployment

```sh
curl https://<your-app>.vercel.app/api/health
```

Expect `{"ok":true,"provider":"vercel-blob"}`. Then open the app, create a
board, add a note, and upload a file.

## Switching storage backends

`STORAGE_DRIVER` selects the provider (`vercel-blob`, `pcloud`, `mock`). Adding
a new backend (e.g. S3/R2) means implementing one `StorageProvider` and adding
a branch in `lib/storage/index.ts` — handlers and UI are untouched.

## Known limitations (tracked for a later increment)

### Upload size cap

Vercel Free caps request bodies at ~4.5MB. To lift this, uploads on the
`vercel-blob` backend go **browser-direct to Blob**, bypassing the function:

- The client asks `GET /api/config`; `uploadStrategy: "direct"` means the
  backend can mint client tokens (otherwise `"proxy"` — multipart through the
  function, used by `mock`/`pcloud` and local dev).
- The browser uploads each file straight to Blob via the `@vercel/blob` client
  SDK, which handshakes with `POST /api/boards/:id/upload-token` for a scoped,
  size-capped token (100MB; the function only mints the token, never carries the
  bytes). No new env var — token minting reuses `BLOB_READ_WRITE_TOKEN`.
- The client then records the uploaded URLs via
  `POST /api/boards/:id/files/attach`. (Vercel also pings `onUploadCompleted`
  after upload; that's logged for diagnostics but the explicit attach call is
  the source of truth, so the flow also works in local dev.)

> Verify end-to-end on a deployed URL: the browser→Blob upload needs a real
> token, and the completion ping needs a public callback URL, so `mock` dev
> exercises only the proxy path. After deploy, upload a >4.5MB file and confirm
> it lands.

### Board metadata staleness (Vercel Blob CDN cache)

The mutable board document (`boards/<id>.json`) lives in Vercel Blob. Every
public Blob URL is served through a CDN whose **minimum cache TTL is 60s**, so
after an overwrite (adding a note, uploading a file) a plain fetch of the stable
URL can return the *pre-write* body for up to a minute. Symptoms observed during
MVP:

- A freshly uploaded image 404s on its `/content` route until the cache catches
  up, and a drag of a just-added item PATCHes against a board that does not yet
  contain it (404).
- Rapid back-to-back adds can lose an item (read-modify-write on a stale base).

**Root cause: the CDN edge cache, not the origin.** Vercel Blob is
read-after-write consistent at the origin for an overwrite of the same key; the
staleness is the cached edge response. An earlier attempt that only appended a
`?_cb=` query string did not help because the runtime `fetch` cache also has to
be bypassed.

**Fix (shipped — `lib/storage/vercel-blob.ts`):**

- Reads in `getBoard` force an origin read with a unique query string **and**
  `cache: "no-store"`, so each board read is read-after-write consistent.
- `putBoard` sets `cacheControlMaxAge: 60` (the SDK floor) to minimise the
  staleness window for any path that does not cache-bust (e.g. images).

**Defense in depth (client, `src/`):** position saves still retry a transient
404 with exponential backoff and keep the on-screen state instead of refreshing;
`<img>` elements retry loading. This covers the rarer `list()` propagation lag
(used to resolve a board URL on a cold function instance) and any residual edge.

**If residual inconsistency ever resurfaces** (the proper fix, not currently
needed): move only the board metadata to a strongly-consistent store (Vercel KV
/ Upstash Redis). Binaries stay on Vercel Blob. `StorageProvider` already
separates `metadata` from `blobs`, so this is a metadata-only swap. See
[ROADMAP.md](./ROADMAP.md).
