import { Fragment, type ReactNode } from "react";

/**
 * Minimal Markdown-subset renderer for note text. Builds React elements
 * directly (no dangerouslySetInnerHTML, no HTML parsing of user input), so
 * there's no injection surface to sanitize. Supports just enough to make
 * notes readable: headings, fenced code blocks, bullet/numbered lists,
 * blockquotes, and inline bold, italic, code span, and links.
 */
export function renderMarkdown(text: string): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```/);
    if (fence) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].match(/^```/)) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(
        <pre className="md-code-block" key={key++}>
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = (`h${level}` as unknown) as "h1" | "h2" | "h3";
      blocks.push(<Tag key={key++}>{renderInline(heading[2])}</Tag>);
      i += 1;
      continue;
    }

    const listMatch = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const items: ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*]|\d+\.)\s+(.*)$/);
        if (!m || /\d+\./.test(m[1]) !== ordered) break;
        items.push(<li key={key++}>{renderInline(m[2])}</li>);
        i += 1;
      }
      blocks.push(ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const quoted: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^>\s?(.*)$/);
        if (!m) break;
        quoted.push(m[1]);
        i += 1;
      }
      blocks.push(<blockquote key={key++}>{renderInline(quoted.join(" "))}</blockquote>);
      continue;
    }

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^```/) &&
      !lines[i].match(/^(#{1,3})\s+/) &&
      !lines[i].match(/^\s*([-*]|\d+\.)\s+/) &&
      !lines[i].match(/^>\s?/)
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++}>
        {paraLines.map((paraLine, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(paraLine)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return blocks;
}

/** Inline spans: **bold**, *italic*, `code`, [text](url). Plain text otherwise. */
function renderInline(text: string): ReactNode {
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={key++}>{match[2]}</em>);
    } else if (match[3] !== undefined) {
      nodes.push(<code key={key++}>{match[3]}</code>);
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const url = match[5];
      // Only allow safe-ish schemes; anything else renders as plain text to
      // avoid a javascript: URL ending up in an href.
      const safe = /^(https?:|mailto:|\/)/i.test(url);
      nodes.push(
        safe ? (
          <a key={key++} href={url} target="_blank" rel="noreferrer">
            {match[4]}
          </a>
        ) : (
          `[${match[4]}](${url})`
        ),
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}
