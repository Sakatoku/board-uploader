import { useRef } from "react";

interface Props {
  onFiles: (files: File[]) => void;
  onAddNote: () => void;
  onToggleDebug?: () => void;
  debugOpen?: boolean;
  /** Show the debug toggle button (controlled by VITE_DEBUG_UI build flag). */
  showDebug?: boolean;
  onCopyLink: () => void;
  /** Whether the server enforces a write key (shows the key control). */
  writeProtected: boolean;
  /** Whether a write key is currently stored locally. */
  keySet: boolean;
  onEditKey: () => void;
  /** Whether new items are placed at the viewport center instead of the last cursor position. */
  placeAtCenter: boolean;
  onTogglePlaceAtCenter: () => void;
}

export function Header({
  onFiles,
  onAddNote,
  onToggleDebug,
  debugOpen = false,
  showDebug = false,
  onCopyLink,
  writeProtected,
  keySet,
  onEditKey,
  placeAtCenter,
  onTogglePlaceAtCenter,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="topbar">
      <p className="brand">BOARD UPLOADER</p>
      <div className="topbar-actions">
        {writeProtected && (
          <button
            className={`button secondary${keySet ? "" : " warn"}`}
            type="button"
            onClick={onEditKey}
            title="書き込みに必要な編集キーを設定します"
          >
            {keySet ? "🔓 編集キー" : "🔒 編集キー必須"}
          </button>
        )}
        <label className="button secondary">
          ファイル追加
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length) onFiles(files);
              event.target.value = "";
            }}
          />
        </label>
        <button className="button secondary" type="button" onClick={onAddNote}>
          テキスト追加
        </button>
        <button
          className={`button secondary${placeAtCenter ? " active" : ""}`}
          type="button"
          onClick={onTogglePlaceAtCenter}
          title="新規アイテムの追加位置を選択します"
          aria-pressed={placeAtCenter}
        >
          {placeAtCenter ? "📍 画面中心に追加" : "📍 カーソル位置に追加"}
        </button>
        {showDebug && (
          <button className="button secondary" type="button" onClick={onToggleDebug}>
            {debugOpen ? "デバッグ非表示" : "デバッグ表示"}
          </button>
        )}
        <button className="button primary" type="button" onClick={onCopyLink}>
          共有URLをコピー
        </button>
      </div>
    </header>
  );
}
