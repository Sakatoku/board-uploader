import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "./Modal";
import { buildKeyTransferUrl } from "../lib/auth";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * QR code (+ copyable link) that hands the locally-stored write key to
 * whichever device scans it, so a new device doesn't need the key typed in
 * by hand. The key rides in a URL fragment (never sent to the server).
 */
export function AddDeviceDialog({ open, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const transferUrl = buildKeyTransferUrl();
    setUrl(transferUrl);
    setCopied(false);
    const canvas = canvasRef.current;
    if (canvas) {
      QRCode.toCanvas(canvas, transferUrl, { width: 240, margin: 1 }).catch(() => {
        /* canvas render failure leaves the link below as the fallback */
      });
    }
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* clipboard unavailable; the URL is still visible and selectable below */
    }
  };

  return (
    <Modal open={open} title="デバイスを追加" onClose={onClose}>
      <div className="modal-form">
        <p className="modal-hint">
          新しいデバイスでこのQRコードを読み取るか、下のリンクを開くと編集キーが自動設定されます。このリンクには編集キーが含まれるため、他人と共有しないでください。
        </p>
        <canvas ref={canvasRef} className="qr-canvas" width={240} height={240} />
        <input
          className="modal-input"
          type="text"
          value={url}
          readOnly
          onFocus={(event) => event.target.select()}
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            閉じる
          </button>
          <button type="button" className="button primary" onClick={handleCopy}>
            {copied ? "コピーしました" : "リンクをコピー"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
