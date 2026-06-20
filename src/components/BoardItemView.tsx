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

function badgeLabel(item: BoardItem): string {
  if (item.type === "note") return "テキスト";
  if (item.type === "image") return "画像";
  if (item.type === "video") return "動画";
  if (item.type === "audio") return "音声";
  if (item.type === "pdf") return "PDF";
  return "ファイル";
}

/** Type icon shown in the item header, replacing the old text tag (TEXT/IMAGE/...). */
function BadgeIcon({ type }: { type: BoardItem["type"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "note":
      return (
        <svg {...common}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="14" height="14" rx="2" />
          <path d="M17 9.5l4-2.5v10l-4-2.5z" />
        </svg>
      );
    case "audio":
      return (
        <svg {...common}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
  }
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
        <span className="item-badge" title={badgeLabel(item)} aria-label={badgeLabel(item)}>
          <BadgeIcon type={item.type} />
        </span>
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
