import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  initialValue: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}

export function RenameDialog({ open, initialValue, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initialValue);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, initialValue]);

  const trySubmit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    trySubmit();
  };

  return (
    <Modal open={open} title="名前を変更" onClose={onCancel}>
      <form className="modal-form" onSubmit={handleFormSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="modal-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="新しい名前を入力してください。"
          autoComplete="off"
        />
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="button primary" disabled={!title.trim()}>
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}
