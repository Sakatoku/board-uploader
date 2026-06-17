import { useSyncExternalStore } from "react";
import { subscribe, getEntries, clearLog, entriesAsText, log } from "../lib/log";

interface Props {
  open: boolean;
  onClose: () => void;
  onCopyStatus: (message: string) => void;
}

export function DebugPanel({ open, onClose, onCopyStatus }: Props) {
  const entries = useSyncExternalStore(subscribe, getEntries);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(entriesAsText());
      onCopyStatus("ログをコピーしました。");
    } catch {
      onCopyStatus("コピーできませんでした（ログはコンソールにも出力されています）。");
    }
  };

  return (
    <section className={`debug-panel${open ? "" : " hidden"}`}>
      <header className="debug-header">
        <span className="debug-title">デバッグログ</span>
        <div className="debug-actions">
          <button className="debug-button" type="button" onClick={handleCopy}>
            コピー
          </button>
          <button
            className="debug-button"
            type="button"
            onClick={() => {
              clearLog();
              log("log cleared");
            }}
          >
            クリア
          </button>
          <button className="debug-button" type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
      </header>
      <div className="debug-log">
        {entries.map((entry) => (
          <div key={entry.id} className={`debug-entry evt-${entry.level}`}>
            <span className="debug-time">{entry.time}</span>
            {entry.text}
          </div>
        ))}
      </div>
    </section>
  );
}
