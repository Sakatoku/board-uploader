import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

/** Plain textarea for now; the structure leaves room to swap in a rich-text editor later. */
export function AddNoteDialog({ open, onSubmit, onCancel }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open]);

  const trySubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    trySubmit();
  };

  return (
    <Modal open={open} title="テキストを追加" onClose={onCancel}>
      <form className="modal-form" onSubmit={handleFormSubmit}>
        <textarea
          ref={textareaRef}
          className="modal-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="追加したいテキストを入力してください。"
          rows={5}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              trySubmit();
            }
          }}
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="button primary" disabled={!text.trim()}>
            追加
          </button>
        </div>
      </form>
    </Modal>
  );
}
