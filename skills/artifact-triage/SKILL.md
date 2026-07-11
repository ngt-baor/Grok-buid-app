---
name: artifact-triage
description: >
  Classify source vs build artifacts for Grok Build: app/, release/, dist/,
  asar, dll, pak. Use when cleaning tree, deciding git add, package size.
---

# artifact-triage

## Classification

| Path / pattern | Class | Git? |
|----------------|-------|------|
| `electron/`, `src/`, `public/`, `assets/` | Source | Yes |
| `skills/`, `docs/`, `scripts/` (non-secret) | Source/docs | Yes |
| `package.json`, lock, configs | Source | Yes |
| `dist/` | Vite build | No |
| `release/`, `release/win-unpacked/` | electron-builder | No |
| `app/` installed copy | Deploy tree | No |
| `node_modules/` | Deps | No |
| `*.exe`, `*.dll`, `*.pak`, `*.asar` | Binary runtime | No (except intentional brand assets under `assets/`/`public/`) |
| `.agents/`, `AGENTS.md` | Personal | No |

## Decisions

- **Push source:** use **push-source-safe** + **secret-scan-release-guard**.
- **Distribute app:** GitHub Release assets from `release/`, not git LFS junk.
- **Debug size:** prefer `win-unpacked` inspection; don’t commit it.

## Rules

- If unsure: **don’t commit** binaries; ask.
- `app/Grok Build/` under repo is local install residue — treat as artifact.

## Verify

- `git status` clean of `dist/`, `release/`, `node_modules/` before push.
