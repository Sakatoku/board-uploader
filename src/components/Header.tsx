import { useRef } from "react";

interface Props {
  onFiles: (files: File[]) => void;
  onAddNote: () => void;
  onToggleDebug: () => void;
  debugOpen: boolean;
  onCopyLink: () => void;
}

export function Header({ onFiles, onAddNote, onToggleDebug, debugOpen, onCopyLink }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="topbar">
      <p className="brand">BOARD UPLOADER</p>
      <div className="topbar-actions">
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
        <button className="button secondary" type="button" onClick={onToggleDebug}>
          {debugOpen ? "デバッグ非表示" : "デバッグ表示"}
        </button>
        <button className="button primary" type="button" onClick={onCopyLink}>
          共有URLをコピー
        </button>
      </div>
    </header>
  );
}
