# ROADMAP / 修繕・改善計画

Board Uploader の現状整理と、今後の修繕（既知の課題の解消）・機能拡張の計画。
方針: **Vercel Free に収める / 早期デプロイして小さく改善 / 不可逆操作と障害調査にリスク低減策を必ず添える。**

最終更新: 2026-06-18

---

## 1. 現状サマリ

| 領域 | 状態 |
|---|---|
| フロント | Vite + React + TS。無限キャンバス（パン）＋ズーム実装済み。ドラッグ移動・D&D・貼り付け対応 |
| バックエンド | Express 5 を Vercel Serverless Function 化（`api/index.ts`）。CommonJS 固定 |
| ストレージ | Vercel Blob（バイナリ＋ボードJSON）。`StorageProvider` で抽象化（vercel-blob / pcloud / mock） |
| 整合性 | CDNキャッシュ遅延を `cache:"no-store"`＋ユニーククエリのオリジン直読みで解消。クライアント側リトライを多層防御として継続 |
| テスト | Vitest（domain / handlers の19件）。**フロントのテストは無し** |
| 認証 | **無し**（リンクを知る人は誰でも閲覧・DL可能） |

動作確認手順は [README.md](./README.md)、デプロイ運用は [DEPLOY.md](./DEPLOY.md)。

---

## 2. 既知の課題・技術的負債（優先度付き）

### P1 — 早めに着手したい

1. ~~**アップロードサイズ上限 ~4.5MB**~~ — **実装済み（2026-06-18）**
   `vercel-blob` でブラウザ直アップロードを導入し関数ボディ上限を回避（単一100MB上限）。
   `StorageProvider` に任意能力 `clientUpload` を追加（vercel-blob のみ実装）→ `/api/config` で
   direct/proxy を判定、`/upload-token` でスコープ付きトークン発行、`/files/attach` でアイテム化。
   `mock`/`pcloud`・ローカルは従来 multipart にフォールバック。attach はユニットテスト済み。
   **残: 実機E2E（>4.5MB の直アップロード）をデプロイ後に確認**（mock では direct 経路を踏めないため）。

2. **認証・アクセス制御が無い（Phase 2）** ← 緊急度UP（改定）
   公開 Blob URL を `directUrl` でそのままクライアントに渡しているため、URL を知れば誰でも DL 可能。
   さらに直アップロードで **無認証の書き込み口**が増えた（`/upload-token` は誰でもトークン発行可、
   `/files/attach` は任意ボードに添付可）。
   → **段階化**: 第1段＝共有シークレット/APIキーによる**書き込みゲート**を小さく導入。
   第2段＝JWT(HttpOnly cookie) + QR ワンタイムトークン。認証導入時は **直 URL を渡さず関数プロキシ
   （`blobs.read`）経由に切替**（`vercel-blob.ts` のコメントにも明記済み）。`serveFile` は既に proxy 経路を持つ。

### P1.5 — main直デプロイを安全にする（改定で繰り上げ）

5'. **フロントエンドのテスト基盤** — **着手済み（2026-06-18）**
   `src/` を Vitest 対象に追加。ズーム純関数を `geometry.ts` に抽出し
   （`clampZoom`/`zoomToward`/`clientToWorld`）単体テスト化（ズームアンカー不変条件ほか）。
   **残: `useDrag` のドラッグ座標計算、コンポーネントの軽いレンダリングテスト**（必要なら jsdom 追加）。

8'. **CI（GitHub Actions）** — **追加済み（2026-06-18）**
   `.github/workflows/ci.yml`: push(main)/PR で `typecheck×2 + test + build` を Linux で実行。
   public リポジトリゆえ無料。docs-only は `paths-ignore` でスキップ、`concurrency` で古い実行をキャンセル。
   → 次段: **孤立blob GC**（直アップ後に attach 失敗/離脱した blob の掃除。`onUploadCompleted` を活用）、
   将来的に **PR＋プレビューデプロイ運用**へ（現状 main 直の安全性向上）。

### P2 — 状況を見て

3. **ボードメタデータの整合性（残リスク）**
   現状の cache-bust で実用上は解消済み。ただし残る経路が2つ:
   - 連続追加時の read-modify-write による lost update（単一ユーザーなら稀）
   - cold な関数インスタンスが `list()` でボード URL を解決する際の伝播遅延
   → 再発する場合のみ **メタデータを即時整合ストア（Vercel KV / Upstash Redis）へ移行**。
   バイナリは Blob のまま。`StorageProvider` が metadata/blobs を分離済みなので metadata だけ差し替え。
   移行後はクライアントのリトライ撤去を検討。**要ユーザー操作**（ストア作成＋環境変数）。
   - 低コストな先行策: ボード URL を `list()` に頼らず、ストア base URL ＋ 決定的パス名から直接導出して
     `list()` 依存を減らす（純コード変更、インフラ不要）。

4. **デバッグログ UI の去就**
   原因切り分け用に残置中（ヘッダー「デバッグ表示」でトグル、既定オフ）。
   → 整合性周りが十分安定したら撤去するか、開発ビルド限定にする。

（フロントテスト基盤＝5'、CI＝8' は P1.5 に繰り上げ済み）

### P3 — 仕上げ・将来

6. **ファイル操作の完全化（Phase 3）**: 削除 / リネーム / テキスト編集 / 移動の UI と API。
   削除は不可逆なので確認ダイアログ＋ログ充実（実装スタンス）。
7. **公開 API（Phase 4）**: `/api/v1/`、OpenAPI 公開、AIフレンドリー化。
   （孤立ファイル GC は P1.5 の 8' に集約）

---

## 3. パン/ズームのフォローアップ

実装は完了（`useViewport` + `BoardCanvas` の `.board-world` transform）。今後あると良い改善:

- **タッチのピンチズーム**は2ポインタ対応で実装済み。実機（スマホ/タブレット）での体感確認は未実施 → 要実機テスト。
- **Fit to content / 全体表示**ボタン（全アイテムを内包する pan/zoom を算出）。
- **ミニマップ**または「画面外にアイテムがある」インジケータ（無限キャンバスで迷子になりにくく）。
- 新規アイテムの配置を「最後のポインタ位置」ではなく**現在ビューの中心**にするオプション
  （パン後にボタン追加すると画面外に置かれる可能性があるため）。
- ズーム時の `<img>` 補間・パフォーマンス（多数アイテム時の transform 再描画）の確認。

---

## 4. 横断方針メモ

- **CommonJS 固定**: `package.json` に `"type":"module"` を付けない（Vercel 関数が壊れる）。詳細は README/DEPLOY。
- **不可逆操作**（削除・上書き・外部ストレージ）は dry-run/モック先行・確認・構造化ログを必ず添える。
- **障害調査性**: API 失敗は「なぜ失敗したか」を後追いできるログを残す（構造化ログ＋デバッグUI）。
