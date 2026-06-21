import { type RefObject, type UIEvent } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement>;
}

/**
 * Plain-text editor with a line-number gutter, scroll-synced to the
 * textarea. Wrapping is disabled so one logical line is always one visual
 * line — otherwise a wrapped line would desync the gutter from the text.
 */
export function LineNumberedEditor({ value, onChange, textareaRef }: Props) {
  const lineCount = value.split("\n").length;

  const handleScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    const gutter = event.currentTarget.previousElementSibling as HTMLElement | null;
    if (gutter) {
      gutter.scrollTop = event.currentTarget.scrollTop;
    }
  };

  return (
    <div className="line-editor">
      <div className="line-editor-gutter" aria-hidden="true">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        className="line-editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={handleScroll}
        spellCheck={false}
        wrap="off"
      />
    </div>
  );
}
