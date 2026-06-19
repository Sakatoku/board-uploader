import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { BoardItem } from "../types";
import { isFileItem } from "../types";
import { contentUrl, downloadUrl } from "../lib/api";
import { log } from "../lib/log";

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function badgeText(item: BoardItem): string {
  if (item.type === "note") return "TEXT";
  if (item.type === "image") return "IMAGE";
  if (item.type === "video") return "VIDEO";
  if (item.type === "audio") return "AUDIO";
  if (item.type === "pdf") return "PDF";
  return "FILE";
}

const IMG_RETRY_DELAYS = [600, 1200, 2000, 3000, 4000];

/** Image that retries loading while the (eventually consistent) store catches up. */
function RetryingImage({ boardId, itemId, alt }: { boardId: string; itemId: string; alt: string }) {
  const base = contentUrl(boardId, itemId);
  const [src, setSrc] = useState(base);
  const attempt = useRef(0);

  return (
    <img
      src={src}
      alt={alt}
      onError={() => {
        if (attempt.current >= IMG_RETRY_DELAYS.length) {
          log("image load gave up", `id=${itemId.slice(0, 8)}`, "warn");
          return;
        }
        const wait = IMG_RETRY_DELAYS[attempt.current];
        attempt.current += 1;
        log("image retry (store catching up)", `id=${itemId.slice(0, 8)} attempt=${attempt.current}`, "warn");
        setTimeout(() => setSrc(`${base}?_r=${Date.now()}`), wait);
      }}
    />
  );
}

interface Props {
  boardId: string;
  item: BoardItem;
  onDragStart: (item: BoardItem, element: HTMLElement, header: HTMLElement, event: ReactPointerEvent) => void;
  onDelete: (itemId: string) => void;
}

export function BoardItemView({ boardId, item, onDragStart, onDelete }: Props) {
  const articleRef = useRef<HTMLElement>(null);

  const handlePointerDown = (event: ReactPointerEvent) => {
    if (articleRef.current) {
      // Keep the canvas from also starting a background pan for this pointer.
      event.stopPropagation();
      onDragStart(item, articleRef.current, event.currentTarget as HTMLElement, event);
    }
  };

  const handleDelete = () => {
    if (!window.confirm(`「${item.title}」を削除しますか？`)) return;
    onDelete(item.id);
  };

  return (
    <article
      ref={articleRef}
      className={`board-item${item.type === "note" ? " note" : ""}`}
      style={{ left: `${item.x}px`, top: `${item.y}px` }}
    >
      <header className="item-header" onPointerDown={handlePointerDown}>
        <span className="item-badge">{badgeText(item)}</span>
        <span className="item-title">{item.title}</span>
        <button
          type="button"
          className="item-delete"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleDelete}
          aria-label="削除"
        >
          ×
        </button>
      </header>
      <div className="item-body">
        {item.type === "note" && !isFileItem(item) ? (
          <div className="note-text">{item.text}</div>
        ) : isFileItem(item) ? (
          <>
            {item.type === "image" && (
              <div className="image-frame">
                <RetryingImage boardId={boardId} itemId={item.id} alt={item.title} />
              </div>
            )}
            {item.type === "video" && (
              <div className="video-frame">
                <video controls src={contentUrl(boardId, item.id)} />
              </div>
            )}
            {item.type === "audio" && (
              <div className="audio-frame">
                <audio controls src={contentUrl(boardId, item.id)} />
              </div>
            )}
            {item.type === "pdf" && (
              <div className="pdf-frame">
                <iframe
                  src={contentUrl(boardId, item.id)}
                  title={item.fileName}
                />
              </div>
            )}
            <div className="file-meta">
              <div className="file-name">{item.fileName}</div>
              <div className="file-detail">
                {item.mimeType} / {formatBytes(item.size)}
              </div>
            </div>
            <div className="card-actions">
              {(item.type === "image" || item.type === "video" || item.type === "pdf") && (
                <a
                  className="link-button secondary"
                  href={contentUrl(boardId, item.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  開く
                </a>
              )}
              <a className="link-button" href={downloadUrl(boardId, item.id)}>
                ダウンロード
              </a>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}
