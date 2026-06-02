# Deployment runbook

Board Uploader runs as a single Express app: static assets in `public/` are
served by Vercel's CDN, and `api/index.ts` is the serverless function that
handles every `/api/*` route (see `vercel.json`).

## 1. Validate pCloud locally (do this first)

The pCloud client performs irreversible operations (overwrite, delete). Before
trusting it in production, validate the real integration in isolation. It
writes/reads/deletes a single throwaway file under `<root>/_healthcheck`.

1. Copy `.env.example` to `.env` and fill in pCloud credentials.
2. Run:

   ```sh
   npm install
   npm run check:pcloud
   ```

   Expect `pCloud integration check: PASS`. If it fails, the structured logs
   printed above the failure show exactly which pCloud call broke and why.

## 2. Authentication to pCloud

Set **one** of these credential pairs in the environment:

- `PCLOUD_ACCESS_TOKEN` — an OAuth access token (preferred).
- `PCLOUD_USERNAME` + `PCLOUD_PASSWORD` — fallback login (will not work if the
  account has 2FA enabled).

Also set `PCLOUD_REGION` to `eu` (eapi.pcloud.com) or `us` (api.pcloud.com),
matching where your pCloud account lives.

## 3. Deploy to Vercel

### Option A — Dashboard (gives automatic deploys on every push)

1. https://vercel.com/new → Import `Sakatoku/board-uploader`.
2. Framework preset: **Other**. Leave build settings empty.
3. Add Environment Variables (Production + Preview):
   - `STORAGE_DRIVER=pcloud`
   - `PCLOUD_REGION=eu` (or `us`)
   - `PCLOUD_ACCESS_TOKEN=...` (or `PCLOUD_USERNAME` / `PCLOUD_PASSWORD`)
   - `PCLOUD_ROOT_PATH=/board-uploader`
   - `LOG_LEVEL=info`
4. Deploy. Subsequent `git push` to `main` auto-deploys.

### Option B — CLI

```sh
npm i -g vercel
vercel login
vercel link
# add env vars (repeat per variable / environment)
vercel env add STORAGE_DRIVER production
vercel --prod
```

## 4. Verify the live deployment

```sh
curl https://<your-app>.vercel.app/api/health
```

Expect `{"ok":true,"provider":"pcloud",...}`. Then open the app in a browser
and create a board, add a note, upload a file.

## Known limitation (tracked for a later increment)

Vercel Free caps request bodies at ~4.5MB, so uploads larger than that will
fail through the function. A direct-to-pCloud upload path is planned to lift
this limit.
