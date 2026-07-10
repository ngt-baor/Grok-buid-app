/**
 * Lightweight Markdown renderer for finished assistant messages.
 * Zero dependency — stream path stays plain textContent for performance.
 * Supports: GFM tables, headings, lists, code fences, bold/italic/code/links, hr, paragraphs.
 */
import { memo, useMemo, type ReactNode } from "react";

type Props = {
  text: string;
  className?: string;
};

function isTableSepCell(cell: string): boolean {
  // :---, ---, ---: etc.
  return /^\s*:?-{3,}:?\s*$/.test(cell);
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  // At least one pipe that isn't only leading/trailing decoration noise
  const cells = splitTableRow(t);
  return cells.length >= 2;
}

function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every(isTableSepCell);
}

/** Inline: **bold**, *em*, `code`, [label](url), plain */
function renderInline(raw: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: code first, then links, bold, italic
  const re =
    /(`+)([^`]+?)\1|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      out.push(raw.slice(last, m.index));
    }
    const k = `${keyPrefix}-${i++}`;
    if (m[2] != null && m[1] != null) {
      out.push(
        <code key={k} className="md-code">
          {m[2]}
        </code>
      );
    } else if (m[3] != null && m[4] != null) {
      out.push(
        <a
          key={k}
          className="md-link"
          href={m[4]}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => {
            e.preventDefault();
            void window.grokApp.openExternal(m![4]!);
          }}
        >
          {m[3]}
        </a>
      );
    } else if (m[5] != null) {
      out.push(
        <strong key={k} className="md-strong">
          {m[5]}
        </strong>
      );
    } else if (m[6] != null || m[7] != null) {
      out.push(
        <em key={k} className="md-em">
          {m[6] ?? m[7]}
        </em>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < raw.length) out.push(raw.slice(last));
  return out;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "hr" }
  | { type: "code"; lang: string; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; text: string }
  | { type: "blank" };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // fenced code
    const fence = line.match(/^```([\w+-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      i += 1;
      const body: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1; // closing ```
      blocks.push({ type: "code", lang, code: body.join("\n") });
      continue;
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (h) {
      blocks.push({
        type: "heading",
        level: h[1]!.length as 1 | 2 | 3 | 4,
        text: h[2]!,
      });
      i += 1;
      continue;
    }

    // hr
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // GFM table: header + separator + rows
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1] ?? "")
    ) {
      const headers = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        const cells = splitTableRow(lines[i] ?? "");
        // pad / trim to header length
        const row = headers.map((_, idx) => cells[idx] ?? "");
        rows.push(row);
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // blank
    if (line.trim() === "") {
      blocks.push({ type: "blank" });
      i += 1;
      continue;
    }

    // paragraph: gather until blank / special block
    const para: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (next.trim() === "") break;
      if (/^```/.test(next)) break;
      if (/^#{1,4}\s+/.test(next)) break;
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(next)) break;
      if (/^\s*[-*+]\s+/.test(next)) break;
      if (/^\s*\d+[.)]\s+/.test(next)) break;
      // don't swallow start of a table
      if (
        isTableRow(next) &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1] ?? "")
      ) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push({ type: "p", text: para.join("\n") });
  }

  return blocks;
}

function renderBlocks(blocks: Block[]): ReactNode[] {
  const nodes: ReactNode[] = [];
  let key = 0;

  for (const b of blocks) {
    const k = `b-${key++}`;
    switch (b.type) {
      case "blank":
        break;
      case "hr":
        nodes.push(<hr key={k} className="md-hr" />);
        break;
      case "heading": {
        const cls = `md-h md-h${b.level}`;
        const kids = renderInline(b.text, k);
        if (b.level === 1) nodes.push(<h1 key={k} className={cls}>{kids}</h1>);
        else if (b.level === 2) nodes.push(<h2 key={k} className={cls}>{kids}</h2>);
        else if (b.level === 3) nodes.push(<h3 key={k} className={cls}>{kids}</h3>);
        else nodes.push(<h4 key={k} className={cls}>{kids}</h4>);
        break;
      }
      case "code":
        nodes.push(
          <pre key={k} className="md-pre" data-lang={b.lang || undefined}>
            <code className="md-code-block">{b.code}</code>
          </pre>
        );
        break;
      case "table":
        nodes.push(
          <div key={k} className="md-table-wrap">
            <table className="md-table">
              <thead>
                <tr>
                  {b.headers.map((h, hi) => (
                    <th key={`${k}-h${hi}`}>{renderInline(h, `${k}-h${hi}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((row, ri) => (
                  <tr key={`${k}-r${ri}`}>
                    {row.map((cell, ci) => (
                      <td key={`${k}-r${ri}-c${ci}`}>
                        {renderInline(cell, `${k}-r${ri}-c${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        break;
      case "ul":
        nodes.push(
          <ul key={k} className="md-ul">
            {b.items.map((item, ii) => (
              <li key={`${k}-i${ii}`}>{renderInline(item, `${k}-i${ii}`)}</li>
            ))}
          </ul>
        );
        break;
      case "ol":
        nodes.push(
          <ol key={k} className="md-ol">
            {b.items.map((item, ii) => (
              <li key={`${k}-i${ii}`}>{renderInline(item, `${k}-i${ii}`)}</li>
            ))}
          </ol>
        );
        break;
      case "p":
        nodes.push(
          <p key={k} className="md-p">
            {renderInline(b.text.replace(/\n/g, " "), k)}
          </p>
        );
        break;
      default:
        break;
    }
  }
  return nodes;
}

function MarkdownBodyInner({ text, className }: Props) {
  const nodes = useMemo(() => {
    if (!text) return null;
    return renderBlocks(parseBlocks(text));
  }, [text]);

  if (!text) return null;
  return <div className={className ? `md-root ${className}` : "md-root"}>{nodes}</div>;
}

export const MarkdownBody = memo(MarkdownBodyInner);
export default MarkdownBody;
