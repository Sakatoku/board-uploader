import { useEffect, useRef, useState, type FormEvent } from "react";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  initialValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** Masked editor for the write key; a toggle reveals it on demand instead of a bare prompt(). */
export function WriteKeyDialog({ open, initialValue, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  const [reveal, setReveal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setReveal(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, initialValue]);

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value);
  };

  return (
    <Modal open={open} title="編集キー（書き込み用）" onClose={onCancel}>
      <form className="modal-form" onSubmit={handleFormSubmit}>
        <div className="password-field">
          <input
            ref={inputRef}
            type={reveal ? "text" : "password"}
            className="modal-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="編集キーを入力してください。"
            autoComplete="off"
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "編集キーを隠す" : "編集キーを表示"}
          >
            {reveal ? "隠す" : "表示"}
          </button>
        </div>
        <p className="modal-hint">空にして保存すると編集キーを消去します。</p>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button type="submit" className="button primary">
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}
