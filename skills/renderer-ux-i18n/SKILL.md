---
name: renderer-ux-i18n
description: >
  Check Grok Build renderer UX: vi/en i18n, theme, settings tabs, keyboard
  shortcuts, layout regression. Use for missing translation, shortcut, theme,
  Settings UI, i18n.ts.
---

# renderer-ux-i18n

## Code map

| Piece | Path |
|-------|------|
| Strings | `src/i18n.ts` (`vi` / `en`, `createT`) |
| Locale default | `electron/settings.cjs` `locale: "vi"` |
| UI | `src/App.tsx`, `src/styles.css` |
| Types | settings locale in `vite-env.d.ts` |

## Shortcuts (product)

| Key | Action |
|-----|--------|
| Ctrl+K | Command palette |
| Ctrl+B / Ctrl+Alt+B / Ctrl+J | Side/right/bottom panels |
| Ctrl+O / N / , | Open / new tab / settings |
| Ctrl+\` | External terminal |

## Checklist

| Area | Check |
|------|-------|
| Locale switch | Settings → all visible chrome switches; restart persists |
| Missing key | Fallback / raw key visible — add both `vi` and `en` |
| Theme | light/dark/system + contrast on tool cards |
| Empty state | 4 starter cards + composer chips |
| Layout | sidebar, composer, right files — no overlap at common widths |

## Rules

- New UI string: both locales in same PR.
- Do not hardcode Vietnamese-only in new surfaces.
- Visual-only change: prefer small CSS; avoid layout thrash.

## Verify

- Toggle vi↔en on Settings, auth, usage, skills labels.
- Shortcuts fire with project open.
