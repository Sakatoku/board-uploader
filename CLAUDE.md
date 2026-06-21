# board-uploader — CLAUDE.md

ホワイトボード風ファイル共有アプリ。ユーザーは本人ひとり。Vercel Free Tier 運用。
フェーズ・TODO・既知の負債 → [ROADMAP.md](./ROADMAP.md)

## 絶対制約（破ると本番が壊れる）

- **`"type":"module"` を package.json に追加しない。** `api/index.ts` は Vercel Serverless Function として CJS の `require` で解決される。ESM に切り替えると拡張子なし相対 import が `ERR_MODULE_NOT_FOUND` になる。フロントエンドは Vite がバンドルするので CJS 下でも動く。
- **Vercel Free Tier の制約を維持する。** 追加インフラ（DB, KV 等）を増やす前に必ず確認。現状ストレージは Vercel Blob のみ。

## ローカル開発

```
npm run dev:api   # Express 開発サーバー :3000
npm run dev:web   # Vite dev server :5173（/api は :3000 へプロキシ）
npm run typecheck        # lib/ + api/ (CommonJS tsconfig)
npm run typecheck:web    # src/ (tsconfig.app.json)
npm test                 # Vitest
```

main push = 本番自動デプロイ（CI はソフトゲート。push 前に typecheck + test を通すこと）。

## ファイルマップ

```
api/index.ts          Vercel エントリ（Express app を export default）
lib/
  app.ts              Express アプリ本体（ルート定義）
  domain/             Board/BlobRef 型・ドメインロジック
  handlers/           HTTPハンドラ（boards.ts）
  http/auth.ts        Stage-1 書き込み保護（WRITE_API_KEY / X-API-Key）
  storage/            StorageProvider 抽象 + vercel-blob / pcloud / mock 実装
  logger.ts           構造化ロガー
src/                  フロントエンド（Vite + React + TS）
  hooks/useViewport.ts  パン/ピンチ/ホイールズーム（ワールド座標）
  hooks/useDrag.ts      ドラッグ（client→world 変換）
  lib/api.ts            バックエンド API クライアント
  lib/auth.ts            編集キーの保存・QR/リンクでの新デバイス転送（Stage-2）
```

## 認証（現状）

- **書き込みのみ保護、読み取りは開放**（Stage-1, fail-open）。読み取り保護はしない方針（意図的）— 共有はボード/アイテムの URL を直接渡す運用を前提とし、URL をテキストとして広く貼らないことで事実上の閲覧制限とする
- 環境変数 `WRITE_API_KEY` が未設定なら全操作許可（ローカル・プレビューに影響しない）
- 設定済みの場合: 書き込み系 API は `X-API-Key` ヘッダー必須。直アップロードは `clientPayload` で渡す
- **Stage-2（新デバイスへの鍵受け渡し、実装済み・フロントエンドのみ）**: 既に鍵を持つデバイスがQRコード／リンク（`#wk=<key>` フラグメント）を生成し、新デバイスが読み取ると `localStorage` に鍵を自動設定する（[src/lib/auth.ts](./src/lib/auth.ts) の `buildKeyTransferUrl` / `consumeKeyFromLocation`、UI は [AddDeviceDialog.tsx](./src/components/AddDeviceDialog.tsx)）。フラグメントはサーバーに送信されないため鍵がアクセスログに残らない。JWT Cookie・サーバー側セッション・デバイス個別失効は実装しない（読み取り保護をしない方針なので、鍵を共有デバイス全体で使う静的モデルのままで十分と判断）
  - 鍵の保存先は `localStorage → sessionStorage → メモリ` の順にフォールバック（プライベートブラウジング等で永続化不可な環境向け。メモリ保持はページ再読み込みで消える）
  - QR/リンクには鍵そのものが入るため、他人に渡さない運用を前提とする（UI上に注意文を表示）

## ストレージ

- バイナリもメタデータ JSON も **Vercel Blob** に一元化（`STORAGE_DRIVER=vercel-blob`）
- `StorageProvider` インターフェース（`lib/storage/provider.ts`）で抽象化済み。`metadata` / `blobs` / オプション `clientUpload` の3能力
- 直アップロード（`clientUpload`）は vercel-blob のみ実装。mock/pcloud は multipart フォールバック
- pCloud プロバイダはコードに残置（`STORAGE_DRIVER=pcloud`）。pCloud アプリ登録がセキュリティ上停止中のため現在は使用不可

## 整合性

- 真因は CDN エッジキャッシュの遅延。`cache: "no-store"` + ユニーククエリでオリジン直読みして解消済み
- クライアント側リトライは多層防御として継続（削除不可）
- 連続追加時の lost update リスクは単一ユーザーゆえ許容中。再発した場合は KV 移行を検討（ROADMAP P2-3）

## 開発スタンス

- 不可逆操作（削除・上書き・外部ストレージ）: dry-run / モック先行 → 確認 → 構造化ログ
- 障害調査性: API 失敗は「なぜ失敗したか」を後追いできるログを残す
