import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { LineNumberedEditor } from "./LineNumberedEditor";

interface Props {
  open: boolean;
  initialValue: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function TextEditDialog({ open, initialValue, onSubmit, onCancel }: Props) {
  const [text, setText] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialValue);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open, initialValue]);

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
    <Modal open={open} title="テキストを編集" onClose={onCancel} className="wide">
      <form
        className="modal-form"
        onSubmit={handleFormSubmit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            trySubmit();
          }
        }}
      >
        <LineNumberedEditor value={text} onChange={setText} textareaRef={textareaRef} />
        <p className="modal-hint">Markdown に対応しています（見出し、リスト、コード、リンクなど）。</p>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="button primary" disabled={!text.trim()}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}
