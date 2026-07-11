---
name: markdown-tool-rendering
description: >
  Debug chat markdown rendering, tool cards, stream chunks, and code blocks in
  Grok Build UI. Use for broken markdown, tool card UI, MarkdownBody, stream
  flicker.
---

# markdown-tool-rendering

## Code map

| Piece | Path |
|-------|------|
| Markdown | `src/MarkdownBody.tsx` |
| Stream / tools | `src/App.tsx` timeline |
| Styles | `src/styles.css` |

## Checks

| Case | Expect |
|------|--------|
| Streaming partial md | no crash; acceptable flicker |
| Fenced code | readable, scroll, no layout explode |
| Links | external via safe open |
| Tool card states | pending / running / done / error |
| Long output | clamp/scroll, UI remains usable |

## Rules

- Sanitize / safe link open (`openExternal`) — no `javascript:` URLs.
- Do not block main thread on huge renders — virtualize/truncate if needed.
- Prefer fix in MarkdownBody for parse issues; App for event ordering.

## Verify

- Prompt that returns headings, lists, code, link — all render.
- Tool call appears as card with status transitions.
