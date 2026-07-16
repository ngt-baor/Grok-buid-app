/**
 * Lightweight Markdown renderer for finished assistant messages.
 * Zero npm deps (uses app i18n for chrome labels). Stream path stays plain
 * textContent for performance.
 * Supports: GFM tables, headings, lists, code fences (+ copy), bold/italic/code/links, hr, paragraphs.
 *
 * Also recovers "collapsed" markdown (headings/tables jammed on one line) which
 * shows up when models or memory storage strip newlines.
 *
 * Table robustness (2026-07-16):
 * - Loose separators: |-| / |--| accepted (normalized to ---)
 * - Fallback: ≥2 consecutive |…| rows without --- still render as <table>
 * - Pad/truncate columns to header width; prefer rows starting with |
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createT } from "./i18n";

type Props = {
  text: string;
  className?: string;
  /** UI locale for chrome labels (copy button). Defaults to vi. */
  locale?: string;
};

/** Fenced code block with one-click copy (scripts, configs, long snippets). */
function CodeBlock({
  code,
  lang,
  locale,
}: {
  code: string;
  lang: string;
  locale?: string;
}) {
  const [copied, setCopied] = useState(false);
  const t = useMemo(() => createT(locale ?? "vi"), [locale]);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const onCopy = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!code) return;
      let ok = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
          ok = true;
        }
      } catch {
        ok = false;
      }
      if (!ok) {
        try {
          const ta = document.createElement("textarea");
          ta.value = code;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          ok = false;
        }
      }
      if (!ok) return;
      setCopied(true);
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1600);
    },
    [code]
  );

  return (
    <div className="md-code-wrap">
      <div className="md-code-toolbar">
        <span className="md-code-lang">{lang || "\u00a0"}</span>
        <button
          type="button"
          className={`md-code-copy${copied ? " is-copied" : ""}`}
          onClick={onCopy}
          aria-label={t("md.copy")}
          title={t("md.copy")}
        >
          {copied ? t("md.copied") : t("md.copy")}
        </button>
      </div>
      <pre className="md-pre" data-lang={lang || undefined}>
        <code className="md-code-block">{code}</code>
      </pre>
    </div>
  );
}

/**
 * GFM wants ≥3 dashes; models often emit |-| or |--|.
 * Accept 1+ dashes (optional : alignment).
 */
function isTableSepCell(cell: string): boolean {
  return /^\s*:?-{1,}:?\s*$/.test(cell);
}

/** Pad loose sep cells to --- so expand/parse stay consistent. */
function normalizeSepCell(cell: string): string {
  const t = cell.trim();
  const m = t.match(/^(:?)(-{1,})(:?)$/);
  if (!m) return "---";
  const left = m[1] || "";
  const right = m[3] || "";
  return `${left}---${right}`;
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  // Do not split on pipes inside inline code (`...`) — e.g. `\|` in a cell.
  const cells: string[] = [];
  let cur = "";
  let inCode = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i]!;
    if (ch === "`") {
      inCode = !inCode;
      cur += ch;
      continue;
    }
    if (ch === "|" && !inCode) {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  return splitTableRow(t).length >= 2;
}

/** Prefer rows that start with | — avoids "Use | to split" false tables. */
function isStrictTableRow(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  return splitTableRow(t).length >= 2;
}

function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = splitTableRow(line);
  return cells.length >= 2 && cells.every(isTableSepCell);
}

function formatRow(cells: string[]): string {
  return "| " + cells.map((c) => c.trim()).join(" | ") + " |";
}

function padCells(cells: string[], n: number): string[] {
  const out = cells.slice(0, n);
  while (out.length < n) out.push("");
  return out;
}

function formatSeparatorFromCells(cells: string[]): string {
  return formatRow(cells.map(normalizeSepCell));
}

/** Match a GFM-ish separator run (1+ dashes per cell). Non-global for .test(). */
const TABLE_SEP_RUN_RE = /\|(?:[ \t]*:?-{1,}:?[ \t]*\|)+/;

/**
 * Rebuild newlines around structural markdown markers so the line-based
 * parser can see headings, HRs, tables, and lists again.
 * Safe on already-well-formed markdown (mostly no-ops).
 */
export function expandCollapsedMarkdown(src: string): string {
  if (!src) return src;

  // Work outside fenced code blocks only
  const segments = src.replace(/\r\n/g, "\n").split(/(^```[\w+-]*\n[\s\S]*?^```$)/m);
  return segments
    .map((seg) => {
      if (/^```/.test(seg)) return seg;
      return expandCollapsedSegment(seg);
    })
    .join("");
}

function expandCollapsedSegment(src: string): string {
  let s = src;

  // 0) Some paths store literal "\n" instead of real newlines
  if (s.includes("\\n")) {
    const realNl = (s.match(/\n/g) || []).length;
    const escNl = (s.match(/\\n/g) || []).length;
    if (escNl >= 2 && realNl < escNl) {
      s = s.replace(/\\n/g, "\n");
    }
  }

  // 1) ATX headings mid-line → own line  ("text ### 1. Title")
  s = s.replace(/([^\n#])[ \t]+(#{1,4}[ \t]+)/g, "$1\n\n$2");
  s = joinSplitHeadingMarkers(s);

  // 2) Horizontal rules jammed between sections (mid-line or end-of-line)
  s = s.replace(
    /([^\n])[ \t]+(-{3,}|\*{3,}|_{3,})[ \t]+(?=#{1,4}|\||(?:\*\*)?[A-Za-zÀ-ỹ0-9])/g,
    "$1\n\n$2\n\n"
  );
  s = s.replace(/([^\n|])[ \t]+(-{3,}|\*{3,}|_{3,})[ \t]*(?=\n|$)/g, "$1\n\n$2");

  // 3) List markers after sentence end
  s = s.replace(/([.!?…:）)\]])\s+([-*+][ \t]+)/g, "$1\n$2");
  s = s.replace(/([.!?…:）)\]])\s+(\d+[.)][ \t]+)/g, "$1\n$2");
  // Numbered items jammed mid-line: "… 2. **Title**" / "… 3. Text"
  s = s.replace(
    /([^\n])[ \t]+(\d{1,2}[.)][ \t]+(?:\*\*[^*]+\*\*|[A-ZÀ-Ỹ0-9]))/g,
    "$1\n$2"
  );

  // 4) Collapsed GFM tables
  s = expandInlineTables(s);

  // 5) Tables still stuck on a heading line → peel title / table apart
  s = peelTablesFromHeadingLines(s);
  s = joinSplitHeadingMarkers(s);

  // 6) Giant ATX heading that swallowed body prose
  s = splitLongHeadings(s);

  // 7) Bold field labels mid-line (" **Gap:** text")
  s = s.replace(/([^\n])[ \t]+(\*\*[^*]{2,48}:\*\*)/g, "$1\n\n$2");

  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

function joinSplitHeadingMarkers(text: string): string {
  return text.replace(/^(#{1,4})[ \t]*\n(?![|#>`\-\s])([^\n]+)/gm, "$1 $2");
}

/**
 * "## Title | a | b | |---|---| | c | d |" → heading line + expanded table.
 */
function peelTablesFromHeadingLines(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const hm = line.match(/^(#{1,4}[ \t]+)(.*)$/);
      if (!hm) return line;
      const prefix = hm[1]!;
      const rest = hm[2]!;
      if (!TABLE_SEP_RUN_RE.test(rest)) return line;

      const expanded = expandInlineTables(rest);
      const pipeIdx = rest.indexOf("|");
      if (pipeIdx <= 0) {
        return expanded.includes("\n") ? `${prefix.trimEnd()}\n${expanded}` : line;
      }
      const title = rest.slice(0, pipeIdx).trim();
      const tablePart = expandInlineTables(rest.slice(pipeIdx));
      if (!title) return `${prefix.trimEnd()}\n${tablePart}`;
      return `${prefix}${title}\n${tablePart}`;
    })
    .join("\n");
}

/**
 * "# Short title. Long body continues…" → heading + paragraph when title is huge.
 */
function splitLongHeadings(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const hm = line.match(/^(#{1,4}[ \t]+)(.+)$/);
      if (!hm) return line;
      const prefix = hm[1]!;
      const rest = hm[2]!;
      if (rest.length < 100) return line;
      // Prefer break before common body markers (Nguồn before em-dash)
      const markers = [" Nguồn:", " Source:", ". "];
      for (const marker of markers) {
        const idx = rest.indexOf(marker);
        if (idx >= 12 && idx <= 90) {
          const title = rest.slice(0, idx).trim();
          const body = rest.slice(idx).trim();
          if (title.length >= 8 && body.length >= 40) {
            return `${prefix}${title}\n\n${body}`;
          }
        }
      }
      // Fallback: first sentence if heading is very long
      const dot = rest.search(/[.!?…][ \t]+/);
      if (dot >= 20 && dot <= 100 && rest.length > 120) {
        const title = rest.slice(0, dot + 1).trim();
        const body = rest.slice(dot + 1).trim();
        if (body.length >= 40) return `${prefix}${title}\n\n${body}`;
      }
      return line;
    })
    .join("\n");
}

/**
 * Find GFM table separator anchors and peel header + data rows onto separate lines.
 * Handles: | H1 | H2 | |---|---| | a | b | | c | d |
 * Also loose seps: |-|-| / |--|--|
 */
function expandInlineTables(text: string): string {
  const sepRe = new RegExp(TABLE_SEP_RUN_RE.source, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = sepRe.exec(text)) !== null) {
    const sep = m[0];
    const sepStart = m.index;
    const sepEnd = sepStart + sep.length;
    const sepCells = splitTableRow(sep);
    const colCount = sepCells.length;
    if (colCount < 2) continue;

    const before = text.slice(last, sepStart);
    const { header, prefix } = takeTrailingTableRow(before, colCount);

    const afterChunk = text.slice(sepEnd);
    const { rows, consumed } = takeLeadingTableRows(afterChunk, colCount);

    // Need at least a header or data rows to treat as a table
    if (!header && rows.length === 0) continue;

    out += prefix;
    const lines: string[] = [];
    if (header) lines.push(header);
    // Always emit canonical --- separators (models often use 1–2 dashes).
    lines.push(formatSeparatorFromCells(sepCells));
    for (const r of rows) lines.push(r);

    if (out.length > 0 && !out.endsWith("\n")) out += "\n";
    out += lines.join("\n");
    // Do NOT force an extra \n when the remainder already starts with one.
    // That used to insert a blank line between separator and body rows for
    // already well-formed multi-line tables, and parseBlocks then stopped
    // collecting tbody (header-only table + raw pipe paragraphs).
    const rem = text.slice(sepEnd + consumed);
    if (rem.length > 0 && !out.endsWith("\n") && !rem.startsWith("\n")) {
      out += "\n";
    }

    last = sepEnd + consumed;
    sepRe.lastIndex = last;
  }

  out += text.slice(last);
  return out;
}

/**
 * Peel the last `colCount` pipe-cells from `before` as a header row.
 */
function takeTrailingTableRow(
  before: string,
  colCount: number
): { header: string | null; prefix: string } {
  // Match trailing "| c1 | c2 | ... | cN |" (optional trailing spaces/newline)
  const re = new RegExp(`((?:\\|[^\\n|]*){${colCount}}\\|)[ \\t]*\\n?$`);
  const m = before.match(re);
  if (!m || m.index == null) return { header: null, prefix: before };

  const cells = splitTableRow(m[1]!);
  if (cells.length < 2) return { header: null, prefix: before };
  // Reject pure separator mistaken as header
  if (cells.every(isTableSepCell)) return { header: null, prefix: before };

  let prefix = before.slice(0, m.index);
  if (prefix && !prefix.endsWith("\n")) prefix += "\n";
  return { header: formatRow(cells), prefix };
}

/**
 * After a separator, take successive rows of `colCount` cells (same line or spaced).
 * Stops at newline / heading / non-table text.
 */
function takeLeadingTableRows(
  after: string,
  colCount: number
): { rows: string[]; consumed: number } {
  let i = 0;
  const n = after.length;
  while (i < n && /[ \t]/.test(after[i]!)) i += 1;

  // Already on a new line → well-formed multi-line table; leave to line parser
  if (i < n && after[i] === "\n") {
    return { rows: [], consumed: 0 };
  }

  const rows: string[] = [];
  // Match "| c1 | c2 | … | cN |" — trailing pipe required (same as takeTrailingTableRow).
  // Bug history: `\\)` was a typo for `\\|)` and made this regex invalid → expand threw
  // on any collapsed table, so the stream plain-text wall stayed visible.
  const rowRe = new RegExp(`^((?:\\|[^\\n|]*){${colCount}}\\|)`);
  let guard = 0;

  while (i < n && guard++ < 200) {
    while (i < n && /[ \t]/.test(after[i]!)) i += 1;
    if (i >= n) break;
    if (after[i] === "\n" || after[i] === "#") break;
    if (after.startsWith("```", i)) break;
    if (after[i] !== "|") break;

    const slice = after.slice(i);
    const m = slice.match(rowRe);
    if (!m) break;

    const cells = splitTableRow(m[1]!);
    if (cells.length < colCount) break;
    if (cells.every(isTableSepCell)) break;

    rows.push(formatRow(cells));
    i += m[1]!.length;
  }

  return { rows, consumed: i };
}

/** Inline: **bold**, *em*, `code`, [label](url), plain + soft line breaks */
function renderInline(raw: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re =
    /(`+)([^`]+?)\1|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      pushTextWithBreaks(out, raw.slice(last, m.index), `${keyPrefix}-t${i}`);
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
  if (last < raw.length) {
    pushTextWithBreaks(out, raw.slice(last), `${keyPrefix}-t${i}`);
  }
  return out;
}

function pushTextWithBreaks(out: ReactNode[], text: string, keyPrefix: string) {
  if (!text) return;
  const parts = text.split("\n");
  parts.forEach((part, idx) => {
    if (idx > 0) out.push(<br key={`${keyPrefix}-br${idx}`} />);
    if (part) out.push(part);
  });
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

    const fence = line.match(/^```([\w+-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      i += 1;
      const body: string[] = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? "")) {
        body.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", lang, code: body.join("\n") });
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (h) {
      let headingText = h[2]!;
      // Defensive: heading line still carries a GFM table — keep only the title
      const sepInHeading = headingText.search(/\|(?:[ \t]*:?-{1,}:?[ \t]*\|)+/);
      if (sepInHeading >= 0) {
        const beforeSep = headingText.slice(0, sepInHeading);
        const pipeIdx = beforeSep.indexOf("|");
        headingText = (pipeIdx >= 0 ? beforeSep.slice(0, pipeIdx) : beforeSep).trim();
        // Re-process this line's table portion on the next loops via inject
        if (headingText) {
          blocks.push({
            type: "heading",
            level: h[1]!.length as 1 | 2 | 3 | 4,
            text: headingText,
          });
        }
        const tableResidue = line.slice(line.indexOf("|"));
        const expanded = expandInlineTables(tableResidue);
        const extra = expanded.split("\n");
        lines.splice(i, 1, ...extra);
        continue;
      }
      blocks.push({
        type: "heading",
        level: h[1]!.length as 1 | 2 | 3 | 4,
        text: headingText,
      });
      i += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }

    // Canonical GFM: header + separator (--- or loose - / --)
    if (
      isStrictTableRow(line) &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1] ?? "")
    ) {
      const rawHeaders = splitTableRow(line);
      const colCount = Math.max(rawHeaders.length, splitTableRow(lines[i + 1] ?? "").length, 2);
      const headers = padCells(rawHeaders, colCount);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i] ?? "";
        // Tolerate blank lines between rows (expand bugs / loose GFM).
        if (rowLine.trim() === "") {
          let k = i + 1;
          while (k < lines.length && (lines[k] ?? "").trim() === "") k += 1;
          const peek = lines[k] ?? "";
          if (
            k < lines.length &&
            isStrictTableRow(peek) &&
            !isTableSeparator(peek)
          ) {
            i = k;
            continue;
          }
          break;
        }
        if (!isStrictTableRow(rowLine) && !isTableRow(rowLine)) break;
        if (isTableSeparator(rowLine)) break;
        const cells = splitTableRow(rowLine);
        rows.push(padCells(cells, colCount));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // Fallback: ≥2 consecutive |…| rows without a separator (model often omits ---).
    if (isStrictTableRow(line) && !isTableSeparator(line)) {
      let j = i;
      const rawRows: string[][] = [];
      while (j < lines.length) {
        const rl = lines[j] ?? "";
        if (rl.trim() === "") break;
        if (isTableSeparator(rl)) {
          // Separator mid-block — treat as normal table starting at i (handled above next loop)
          break;
        }
        if (!isStrictTableRow(rl)) break;
        rawRows.push(splitTableRow(rl));
        j += 1;
      }
      if (rawRows.length >= 2) {
        const colCount = Math.max(2, ...rawRows.map((r) => r.length));
        // Require majority of rows to look multi-column (avoid "a | b" prose walls)
        const multi = rawRows.filter((r) => r.length >= 2).length;
        if (multi >= 2 && multi >= Math.ceil(rawRows.length * 0.75)) {
          const headers = padCells(rawRows[0]!, colCount);
          const rows = rawRows.slice(1).map((r) => padCells(r, colCount));
          blocks.push({ type: "table", headers, rows });
          i = j;
          continue;
        }
      }
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (line.trim() === "") {
      blocks.push({ type: "blank" });
      i += 1;
      continue;
    }

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
      // Don't swallow pipe tables into a paragraph (with or without ---).
      if (isStrictTableRow(next)) break;
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

/** True when we got real structure (not one giant paragraph). */
function hasUsefulStructure(blocks: Block[]): boolean {
  let rich = 0;
  let shortParas = 0;
  for (const b of blocks) {
    if (b.type === "blank") continue;
    if (b.type === "heading" || b.type === "table" || b.type === "ul" || b.type === "ol" || b.type === "code" || b.type === "hr") {
      rich += 1;
      continue;
    }
    if (b.type === "p" && b.text.length <= 400) shortParas += 1;
  }
  return rich >= 1 || shortParas >= 2;
}

function renderBlocks(blocks: Block[], locale?: string): ReactNode[] {
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
          <CodeBlock key={k} code={b.code} lang={b.lang} locale={locale} />
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
            {renderInline(b.text, k)}
          </p>
        );
        break;
      default:
        break;
    }
  }
  return nodes;
}

function MarkdownBodyInner({ text, className, locale }: Props) {
  const result = useMemo(() => {
    if (!text) return { mode: "empty" as const };

    try {
      const expanded = expandCollapsedMarkdown(text);
      const blocks = parseBlocks(expanded);

      if (hasUsefulStructure(blocks)) {
        return { mode: "md" as const, nodes: renderBlocks(blocks, locale) };
      }

      // Fallback: pre-wrap friendly text (prefer expanded if it gained newlines)
      const soft =
        (expanded.match(/\n/g) || []).length > (text.match(/\n/g) || []).length
          ? expanded
          : text;
      return { mode: "raw" as const, soft };
    } catch {
      // Never blank the bubble — show original text if expand/parse blows up
      return { mode: "raw" as const, soft: text };
    }
  }, [text, locale]);

  if (result.mode === "empty") return null;

  if (result.mode === "raw") {
    return (
      <div
        className={
          className ? `md-root md-raw-fallback ${className}` : "md-root md-raw-fallback"
        }
      >
        <p className="md-p md-p-raw">{renderInline(result.soft, "raw")}</p>
      </div>
    );
  }

  return (
    <div className={className ? `md-root ${className}` : "md-root"}>{result.nodes}</div>
  );
}

export const MarkdownBody = memo(MarkdownBodyInner);
export default MarkdownBody;
