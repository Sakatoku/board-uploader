# Board Uploader

ホワイトボード風のファイル/テキスト共有アプリ。1つの URL = 1つのボードで、
テキスト・画像・任意ファイルをボード上の好きな位置に置き、同じ URL を共有すれば
他の人も同じ内容を閲覧・ダウンロードできます（MVP はリンク共有型・認証なし）。

- 本番: https://board-uploader.vercel.app
- ヘルスチェック: `GET /api/health` → `{"ok":true,"provider":"vercel-blob"}`

## 現状（1st MVP 達成）

できること:

- ボードの自動生成（トップを開くと新規ボードへリダイレクト）
- テキスト追加 / ファイル・画像アップロード（ボタン・ドラッグ&ドロップ・クリップボード貼り付け）
- アイテムのドラッグ移動（位置はサーバーに保存）
- **無限キャンバス**: 背景ドラッグ / ホイールでパン（スクロール）、アイテムは無制限の座標に配置可能
- **拡大縮小**: Ctrl+ホイール（またはトラックパッド/タッチのピンチ）でカーソル位置を中心にズーム、画面下中央の `− / % / +` ボタンで操作・リセット（20%〜400%）
- 画像のインライン表示、各ファイルのダウンロード
- 共有 URL コピー
- 画面内デバッグログパネル（ヘッダーの「デバッグ表示」でトグル / 既定は非表示）

## 技術スタック（実態）

| 層 | 採用 |
|---|---|
| Frontend | **Vite + React + TypeScript**（`src/`、ビルド出力 `dist/`） |
| Backend | Express 5 を Vercel Serverless Function 化（`api/index.ts`） |
| Storage | Vercel Blob（バイナリ本体＋ボード JSON）。`STORAGE_DRIVER` で差し替え可 |
| Test | Vitest（`lib/` のドメイン/ハンドラ ＋ `src/` の座標・ズーム計算） |
| CI | GitHub Actions（push(main)/PR で typecheck×2 ＋ test ＋ build。public repo ゆえ無料） |
| 言語/ビルド | TypeScript。**API/lib は CommonJS 固定**（下記注意参照） |

> **重要（CJS/ESM の地雷）:** この repo の `package.json` に `"type":"module"` を**付けない**こと。
> `api/index.ts` は CommonJS のサーバーレス関数で、ESM 化すると Vercel が拡張子なし相対 import を
> 解決できず `ERR_MODULE_NOT_FOUND` で本番が壊れます。フロント（`src/`）は ESM/JSX で書きますが、
> Vite/esbuild がバンドルするため Node のモジュール解決には依存せず、CJS パッケージ下で問題なく動きます。
> 型は API 用 `tsconfig.json`(CommonJS) とフロント用 `tsconfig.app.json`(ESNext) で分離しています。

## ローカル開発

フロント（Vite, :5173）と API（Express, :3000）を**別プロセス**で起動します。Vite が `/api` を
:3000 へプロキシします（`vite.config.ts`）。2つのターミナルで:

```sh
npm install
npm run dev:api      # ターミナル1: API（tsx watch dev-server.ts, :3000）
npm run dev:web      # ターミナル2: フロント（vite, :5173）→ ブラウザでこちらを開く
```

その他:

```sh
npm run build         # vite build → dist/
npm run preview       # ビルド済み dist/ をプレビュー
npm test              # Vitest（lib＋src のロジック）
npm run typecheck     # API/lib の型（tsconfig.json）
npm run typecheck:web # フロントの型（tsconfig.app.json）
```

CI（`.github/workflows/ci.yml`）が push(main)/PR で上記の `typecheck` × 2・`test`・`build` を
実行します。`main` への push は Vercel デプロイと**並列**で走ります（現状は CI 失敗でもデプロイは
止まらないソフトゲート）。

ストレージは API 側で選択。ローカルの `dev:api` は既定で `STORAGE_DRIVER=mock`（インメモリ・非永続）。
本番は `vercel-blob`。

## プロジェクト構成

```
index.html         Vite エントリ（/src/main.tsx を読む）
vite.config.ts     フロントビルド設定（react プラグイン、/api プロキシ）
tsconfig.app.json  フロント用 TS 設定（ESNext / DOM / react-jsx）
src/
  main.tsx         ReactDOM ルート
  App.tsx          状態統括 + Header/BoardCanvas/DebugPanel 配置
  styles.css       グローバル CSS
  types.ts         lib/domain/types の型を再利用 + クライアント専用型
  lib/             api.ts（fetch+リトライ+直/proxyアップロード切替）/ log.ts（デバッグログ）/ geometry.ts（client→world座標変換・ズーム計算）
  hooks/           useBoard（状態・操作）/ useDrag（ポインタドラッグ）/ useViewport（パン・ズーム）
  components/      Header / BoardCanvas（無限キャンバス+ズームUI） / BoardItemView / DebugPanel
public/            Vite の静的パススルー（現状は空）
api/index.ts       Vercel 関数のエントリ（Express app を default export）
lib/
  app.ts           ルーティング定義（/api/*）
  domain/          純粋ドメインロジック（board/item、I/Oなし＝単体テスト容易）
  handlers/        StorageProvider を受け取るフレームワーク非依存ハンドラ
  storage/         StorageProvider 抽象 + 実装（vercel-blob / pcloud / mock）
  http/            エラー型など HTTP アダプタ
  logger.ts        構造化ログ（1行1 JSON）
scripts/check-storage.ts   実ストレージの疎通チェック（使い捨てボードで CRUD）
.github/workflows/ci.yml   CI（typecheck×2 + test + build）
```

設計の肝: ハンドラは `StorageProvider` と「パース済み入力」を受け取り、プレーンな
データを返す（or `HttpError` を throw）。HTTP の解釈/整形はアダプタ側。これにより
サーバーを起動せずロジックを単体テストできます。

## API（概要）

🔒 = 書き込み保護が有効（`WRITE_API_KEY` 設定時）に `X-API-Key`（直アップロードは clientPayload）が必要。読み取りは常に開放。

| Method | Path | 説明 | 🔒 |
|---|---|---|---|
| GET | `/api/health` | ストレージ疎通を含むヘルス | |
| GET | `/api/config` | アップロード方式・上限・`writeProtected` を通知 | |
| POST | `/api/boards` | ボード作成 | 🔒 |
| GET | `/api/boards/:boardId` | ボード取得 | |
| POST | `/api/boards/:boardId/notes` | テキスト追加 | 🔒 |
| POST | `/api/boards/:boardId/files` | ファイル/画像アップロード（multipart proxy） | 🔒 |
| POST | `/api/boards/:boardId/upload-token` | 直アップロード用トークン発行（vercel-blob のみ） | 🔒 |
| POST | `/api/boards/:boardId/files/attach` | 直アップロード済みファイルをアイテム化 | 🔒 |
| PATCH | `/api/boards/:boardId/items/:itemId` | 位置更新 | 🔒 |
| GET | `/api/boards/:boardId/items/:itemId/content` | インライン取得 | |
| GET | `/api/boards/:boardId/items/:itemId/download` | ダウンロード | |

## 既知の制約

- **アップロードサイズ上限**: `vercel-blob` ではブラウザ直アップロード（関数を経由せず Blob に送信）で
  Vercel Free の ~4.5MB 関数ボディ上限を回避（単一ファイル上限 100MB）。`mock`/`pcloud`・ローカルは
  従来の multipart（proxy）にフォールバック。直アップロードの実機E2Eはデプロイ後の確認が必要（[DEPLOY.md](./DEPLOY.md)）。
- **ボードメタデータのCDNキャッシュ遅延**（Vercel Blob）。公開 Blob URL は最小60sのCDNキャッシュを挟むため、
  上書き直後の読み直しが古い内容を返し得る。**対策実装済み**: 読み取りを `cache:"no-store"`＋ユニーククエリで
  オリジン直読みにし、書き込み TTL を最小化（`lib/storage/vercel-blob.ts`）。加えてクライアント側の
  リトライ＋ローカル状態保持を多層防御として継続。詳細・将来の即時整合ストア移行案は
  [DEPLOY.md](./DEPLOY.md) と [ROADMAP.md](./ROADMAP.md) を参照。
- **認証は第1段（書き込みゲート）のみ**。読み取りは共有リンクで開放、書き込みは `WRITE_API_KEY`
  設定時に編集キー（`X-API-Key`）が必要（既定は fail-open ＝未設定なら従来どおり）。ヘッダーの「編集キー」で
  設定。第2段（JWT Cookie＋QRワンタイムトークン）は今後（[ROADMAP.md](./ROADMAP.md)）。有効化手順は [DEPLOY.md](./DEPLOY.md)。

今後の改善・修繕計画は [ROADMAP.md](./ROADMAP.md)、運用手順は [DEPLOY.md](./DEPLOY.md) を参照。

## デプロイ

`vercel --prod`。手順の全体は [DEPLOY.md](./DEPLOY.md)。
