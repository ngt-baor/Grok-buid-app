# Project skills (Grok Build)

Playbooks for the Grok agent. **Not** Codex plugin skills.

## Already baseline (general)

| Skill | Việc |
|-------|------|
| `yeet-grok` | Commit + push + PR (git hoặc MCP) |
| `gh-fix-ci-grok` | CI / Actions fail |
| `gh-address-comments-grok` | PR review comments |
| `push-source-safe` | Policy push source |
| `e2e-report-md` | E2E → md/csv |
| `electron-desktop-qa` | Smoke Electron |
| `mcp-fallback-map` | Shell dead → MCP map |

## P0 — product core

| Skill | Việc |
|-------|------|
| `grok-auth-oidc` | Device-code login, token, logout, `auth.json` |
| `grok-acp-bridge-debug` | ACP stdio, session/prompt, stream/tools |
| `electron-ipc-contract` | main ↔ preload ↔ vite-env.d.ts |
| `github-release-updater` | Update từ GitHub Releases |
| `packaging-release-win` | `dist:win`, artifact, không commit release/ |

## P1 — app systems

| Skill | Việc |
|-------|------|
| `storage-hygiene-indexeddb` | IDB/WAL bloat, purge/flush |
| `session-tabs-state` | Sessions, tabs, drafts, single-flight |
| `usage-billing-profile` | Credits vs tokens, profile stats |
| `skills-discovery-runtime` | Scanner `skills/` + user roots |
| `renderer-ux-i18n` | vi/en, theme, shortcuts, layout |
| `permission-gate-policy` | Allow once / Always / Deny |

## P2 — as needed

| Skill | Việc |
|-------|------|
| `attachments-clipboard` | Clipboard image, file attach |
| `chrome-devtools-mcp-integration` | Opt-in Chrome DevTools MCP |
| `markdown-tool-rendering` | Markdown + tool cards stream |
| `git-panel-worktrees` | Git chip, worktrees |
| `app-settings-persistence` | `%APPDATA%` settings.json |
| `windows-terminal-launch` | Terminal ngoài + cwd |

## Security / release guard

| Skill | Việc |
|-------|------|
| `secret-scan-release-guard` | Scan secret/path trước push |
| `release-tag-retag-policy` | Tag `v0.1.x`, retag rules |
| `artifact-triage` | Source vs `app/` `release/` `dist/` |

## Discovery

`electron/skills.cjs` scans `./skills/` (this folder), project `.agents`/`.grok` skills, and user/bundled roots under `~`.

## Not duplicated here

`docx`, `xlsx`, `pptx`, design-taste packs, Codex-only Cowart/excel-live/Google write.
