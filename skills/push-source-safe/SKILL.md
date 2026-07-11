---
name: push-source-safe
description: >
  Enforce what may and must not be pushed for Grok Build App
  (ngt-baor/Grok-buid-app). Use before any git push, yeet, release:push, or
  GitHub MCP push_files. Reads PUSH-CHECKLIST.md policy.
---

# push-source-safe

Repo: https://github.com/ngt-baor/Grok-buid-app

## Blocked (never stage / never push_files)

| Path / pattern | Why |
|----------------|-----|
| `AGENTS.md`, `Agents.md` | Personal harness |
| `.agents/` | Personal harness |
| `MEMORY.md`, `Harness-Engineering.txt` | Local memory |
| `auth.json`, `.env*`, secrets | Credentials |
| `_diag_*.js` | Personal diagnostics |
| `node_modules/`, `dist/`, `release/` | Build artifacts (exe → GitHub **Release**, not tree) |
| Absolute `C:\Users\...` session paths in content | Machine-local |
| `.grok/sessions`, chat dumps | Personal |

Scripts: `scripts/push-source-only.ps1` / `push-clean.ps1` unstage these — mirror that behavior when shipping via MCP.

## Allowed (source ship set)

| Path | Notes |
|------|--------|
| `electron/`, `src/`, `public/`, `assets/` | App source + brand |
| `package.json`, `package-lock.json` | Version + updateRepo |
| `README.md`, `PROJECT.md`, `docs/*` | Public docs |
| `skills/*` | **This** public playbook folder (not `.agents/`) |
| `scripts/*` except personal `_` diag | Prefer non-secret scripts |
| `index.html`, `vite.config.ts`, `tsconfig.json` | Tooling |

## Pre-push checklist

1. List files about to ship.
2. Reject any blocked pattern.
3. Confirm `package.json` → `grokBuild.updateRepo` is `ngt-baor/Grok-buid-app` if touching update config.
4. Prefer **yeet-grok** for the actual push/PR.
5. Installer `.exe`: GitHub Release asset, not git blob.

## Local one-shot (when shell works)

```powershell
cd D:\grok-buid-app
npm run release:push
# or source-only:
powershell -ExecutionPolicy Bypass -File .\scripts\push-source-only.ps1
```

## MCP ship

Only include allowed paths in `push_files` file list. If remote is still skeleton (`0.1.0` / few files), batch source deliberately — do not upload `node_modules` or `release/`.
