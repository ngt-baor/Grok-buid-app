---
name: packaging-release-win
description: >
  Windows packaging for Grok Build: npm run dist:win, electron-builder artifacts,
  what not to commit (release/, dist/, app/). Use for build installer, portable
  exe, electron-builder, packaging fail.
---

# packaging-release-win

## Commands (shell required)

```powershell
cd D:\grok-buid-app
npm install
npm run dist:win
# outputs under release\
```

Also: `BUILD-RELEASE.bat`, `npm run pack` (dir only).

## Artifacts

| Path | Commit? |
|------|---------|
| `release/*.exe`, `latest.yml`, `win-unpacked/` | **No** — GitHub Release / local |
| `dist/` (Vite) | **No** |
| `app/` copied install tree | **No** |
| Source `electron/`, `src/`, `assets/` | **Yes** |

## package.json build notes

- `appId` / `productName`: Grok Build
- `directories.output`: `release`
- `files`: dist + electron + assets — excludes harness md / `.agents`

## Debug checklist

| Fail | Check |
|------|-------|
| icon | `npm run icon:png` / assets |
| electron-builder missing | `npm install` |
| ASAR / main path | `extraMetadata.main` → `electron/main.cjs` |
| Huge output | accidental node_modules in files globs |

## Rules

- Never `git add release/` or `dist/` for normal source push (**push-source-safe**).
- Ship exe via GitHub Releases + **github-release-updater**.
- Shell dead → document commands only; do not claim build succeeded.

## Verify

- `release/Grok Build-Setup-*.exe` and/or Portable exists.
- Fresh install launches; version matches `package.json`.
