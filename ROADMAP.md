# ROADMAP / 修繕・改善計画

Board Uploader の現状整理と今後の計画。
方針・制約・ファイルマップ → [CLAUDE.md](./CLAUDE.md)

最終更新: 2026-06-21（テキストファイルのリッチ編集を実装）

---

## 現状サマリ

| 領域 | 状態 |
|---|---|
| フロント | Vite + React + TS。無限キャンバス（パン）＋ズーム実装済み。ドラッグ移動・D&D・貼り付け対応 |
| バックエンド | Express 5 → Vercel Serverless Function（`api/index.ts`）。CommonJS 固定 |
| ストレージ | Vercel Blob（バイナリ＋ボードJSON）。`StorageProvider` で抽象化（vercel-blob / pcloud / mock） |
| 整合性 | `cache:"no-store"` ＋ユニーククエリのオリジン直読みで解消。クライアントリトライを多層防御として継続 |
| テスト | Vitest 171件（domain / handlers / gc / geometry / useDrag / markdown / コンポーネント）。jsdom 環境でフロントエンドテスト済み |
| 認証 | Stage-1（書き込みゲート）実装済み。Stage-2（JWT Cookie + QR）は未着手 |
| CI | GitHub Actions（typecheck×2 + test + build）稼働中 |

---

## 完了済み

- ✓ **アップロードサイズ上限解消**: vercel-blob ブラウザ直アップロード（100MB）
- ✓ **認証 Stage-1**: `WRITE_API_KEY` で書き込み保護（fail-open）
- ✓ **フロントエンドテスト基盤**: geometry.ts 抽出＋ズーム計算の単体テスト
- ✓ **CI**: GitHub Actions（public repo、無料）
- ✓ **ストレージ整合性**: CDN キャッシュ遅延を no-store ＋ユニーククエリで解消
- ✓ **無限キャンバス＋ズーム**: ワールド座標＋useViewport（パン/ピンチ/ホイール）
- ✓ **孤立 blob GC**: `onUploadCompleted` でマーカー書き込み → 10 分 grace period 後にサイレント GC。`POST /api/admin/gc` で手動トリガーも可。
- ✓ **フロントエンドテスト**: `useDrag`（ドラッグ座標計算 15件）、`Header`（11件）、`BoardItemView`（15件）を jsdom 環境で追加。計83件。
- ✓ **video / audio / PDF インラインプレビュー**: MIME 判別拡張・`<video>` / `<audio>` / `<iframe>` レンダリング・バッジ・「開く」リンク追加。テスト計100件。
- ✓ **アイテム削除**: カードヘッダーの `×` ボタン＋確認ダイアログ。楽観的削除・ロールバック・blob best-effort 削除（GC は多層防御として継続）。テスト計108件。
- ✓ **デバッグログ UI のビルドフラグ限定**: `VITE_DEBUG_UI` ビルドフラグで既定オフ・ヘッダーの「デバッグ表示」トグルで開発時のみ表示可能に。
- ✓ **アイテムのリネーム**: カードヘッダーの ✎ ボタン → モーダルで名前変更。PATCH `/api/boards/:boardId/items/:itemId` に `title` を追加（既存の x/y 更新と統合）。移動は既存のドラッグ＆ドロップで対応済み。
- ✓ **テキストファイルのリッチ編集**: ノート本文クリックで行番号付きエディタを開いて編集（PATCH に `text` を追加）。表示側は依存ライブラリなしの自前 Markdown サブセットレンダラ（見出し/リスト/引用/コードブロック/太字/斜体/インラインコード/リンク）で `dangerouslySetInnerHTML` を使わず React 要素を直接構築（XSS面なし）。

---

## 残タスク

### P2 — 状況を見て

- **ボードメタデータ整合性（残リスク）**: 現状の cache-bust で実用上解消済み。再発した場合のみ Vercel KV / Upstash Redis へメタデータを移行。バイナリは Blob のまま。`StorageProvider` が metadata/blobs を分離済みなので差し替え可能。
  - ✓ 先行策（インフラ不要）: `BLOB_READ_WRITE_TOKEN` からストア ID を抜き出し決定的 URL を直接導出、`list()`（eventual consistency）を経由せず読む。404 時のみ `list()` にフォールバック。

### P3 — 仕上げ・将来

- **認証 Stage-2**: JWT（HttpOnly cookie）+ QR ワンタイムトークンによるデバイス信頼転送。あわせて Blob 直 URL を関数プロキシ経由に切替（読み取り保護。`serveFile` は既に proxy 経路あり）。

- **公開 API（Phase 4）**: `/api/v1/`、OpenAPI 公開、AI フレンドリー化。

---

## パン/ズーム フォローアップ

実装完了。残りの改善候補：

- タッチ実機（スマホ/タブレット）でのピンチズーム体感確認

✓ **Fit to content ボタン**: 全アイテムを内包する pan/zoom を算出してフレーミング。ズームコントロールの左端（⛶）。アイテムが無いときは無効化。

✓ **画面外アイテムのインジケータ**: アイテムが画面外にあるとき、キャンバス中心から見た方向の縁に矢印アイコンを表示（クリックでそのアイテムへパン）。位置は item の x/y のみで近似（カードの実サイズは見ない）。

✓ **新規アイテムの配置オプション**: ヘッダーのトグルボタンで「カーソル位置」「画面中心」を切り替え。localStorage に永続化（既定はカーソル位置、従来どおり）。
