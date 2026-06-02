# Deployment runbook

Board Uploader runs as a single Express app: static assets in `public/` are
served by Vercel's CDN, and `api/index.ts` is the serverless function that
handles every `/api/*` route (see `vercel.json`). Storage is pluggable via
`STORAGE_DRIVER`; production uses **Vercel Blob**.

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

## Known limitation (tracked for a later increment)

Vercel Free caps request bodies at ~4.5MB, so uploads larger than that fail
through the function. A client-direct upload path is planned to lift this.
