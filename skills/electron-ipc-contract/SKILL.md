---
name: electron-ipc-contract
description: >
  Keep Electron IPC contract aligned across main.cjs handlers, preload.cjs
  grokApp API, and src/vite-env.d.ts. Use when adding/renaming IPC, type errors
  on window.grokApp, invoke channel mismatch.
---

# electron-ipc-contract

## Three surfaces (must match)

| Layer | File | Role |
|-------|------|------|
| Main | `electron/main.cjs` `ipcMain.handle("channel", …)` | Implementation |
| Preload | `electron/preload.cjs` `window.grokApp.*` | Whitelist invoke/on |
| Types | `src/vite-env.d.ts` | Renderer TypeScript |

Optional UI call sites: `src/App.tsx` (and others).

## Checklist when changing IPC

1. Add/change handler in `main.cjs`.
2. Expose same name/args in `preload.cjs` (no raw `ipcRenderer` in renderer).
3. Update `GrokApp` / related types in `vite-env.d.ts`.
4. Update callers; fix TS.
5. Events: main `webContents.send` ↔ preload `ipcRenderer.on` ↔ typed subscribe API.

## Common failures

| Bug | Symptom |
|-----|---------|
| Handler without preload | Runtime “not a function” / undefined |
| Preload without handler | Invoke hang / “No handler” |
| Types only | Compiles, runtime miss — or opposite |
| Arg shape drift | Silent wrong behavior |
| Channel rename half-done | Intermittent features |

## Rules

- Never expose `ipcRenderer` wholesale to renderer.
- Prefer `invoke` request/response; document push events.
- New feature: ship all three layers in one change set.

## Audit method

1. Grep `ipcMain.handle("` in `electron/main.cjs`.
2. Grep `invoke("` in `electron/preload.cjs`.
3. Diff channel strings; every handle used by preload (or dead-code justify).
4. Diff `vite-env.d.ts` method list vs preload keys.
