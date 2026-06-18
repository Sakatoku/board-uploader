# ROADMAP / 修繕・改善計画

Board Uploader の現状整理と今後の計画。
方針・制約・ファイルマップ → [CLAUDE.md](./CLAUDE.md)

最終更新: 2026-06-18

---

## 現状サマリ

| 領域 | 状態 |
|---|---|
| フロント | Vite + React + TS。無限キャンバス（パン）＋ズーム実装済み。ドラッグ移動・D&D・貼り付け対応 |
| バックエンド | Express 5 → Vercel Serverless Function（`api/index.ts`）。CommonJS 固定 |
| ストレージ | Vercel Blob（バイナリ＋ボードJSON）。`StorageProvider` で抽象化（vercel-blob / pcloud / mock） |
| 整合性 | `cache:"no-store"` ＋ユニーククエリのオリジン直読みで解消。クライアントリトライを多層防御として継続 |
| テスト | Vitest 42件（domain / handlers / gc / geometry）。useDrag・コンポーネントのテストは未着手 |
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

---

## 残タスク

### P1.5 — main 直デプロイを安全にする

- **フロントエンドテスト追記**: `useDrag` のドラッグ座標計算、コンポーネントの軽いレンダリングテスト（jsdom 追加が必要なら検討）

### P2 — 状況を見て

- **ボードメタデータ整合性（残リスク）**: 現状の cache-bust で実用上解消済み。再発した場合のみ Vercel KV / Upstash Redis へメタデータを移行。バイナリは Blob のまま。`StorageProvider` が metadata/blobs を分離済みなので差し替え可能。
  - 先行策（インフラ不要）: `list()` に頼らずストア base URL + 決定的パス名から board URL を直接導出し伝播遅延を減らす。

- **デバッグログ UI の去就**: 整合性周りが十分安定したら撤去またはビルドフラグ限定にする（現状: ヘッダー「デバッグ表示」でトグル、既定オフ）。

### P3 — 仕上げ・将来

- **ファイル操作の完全化**: 削除 / リネーム / テキスト編集 / 移動の UI と API。削除は確認ダイアログ＋構造化ログ必須。

- **認証 Stage-2**: JWT（HttpOnly cookie）+ QR ワンタイムトークンによるデバイス信頼転送。あわせて Blob 直 URL を関数プロキシ経由に切替（読み取り保護。`serveFile` は既に proxy 経路あり）。

- **公開 API（Phase 4）**: `/api/v1/`、OpenAPI 公開、AI フレンドリー化。

---

## パン/ズーム フォローアップ

実装完了。残りの改善候補：

- タッチ実機（スマホ/タブレット）でのピンチズーム体感確認
- Fit to content ボタン（全アイテムを内包する pan/zoom を算出）
- 画面外アイテムのインジケータ（無限キャンバスで迷子防止）
- 新規アイテムの配置を「現在ビューの中心」にするオプション
