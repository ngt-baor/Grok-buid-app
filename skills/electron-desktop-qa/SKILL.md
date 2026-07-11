---
name: electron-desktop-qa
description: >
  Smoke and regression checklist for Windows Electron desktop apps (Grok Build,
  DiscordLyrics-class). Covers launch, auth, settings, update, packaging
  artifacts. Use for "smoke Electron", "desktop QA", "test app window".
---

# electron-desktop-qa

## Scope

Windows-first Electron shell: main process + renderer + optional CLI bridge.

Out of scope unless asked: full Playwright suite authoring, code signing cert purchase.

## Preconditions

| Need | Note |
|------|------|
| Shell / npm | Required for `npm run dev` / packaged exe |
| If shell dead | Document **BLOCKED**; do not fake UI results |

## Smoke matrix (minimum)

| # | Area | Check | Pass if |
|---|------|-------|---------|
| 1 | Launch | `npm run dev` or installed exe | Window opens, no crash loop |
| 2 | Project | Open folder | cwd set; recent list updates |
| 3 | Auth | Device-code / token status | Shows signed-in or clear CTA; no terminal-required dead end |
| 4 | CLI | Detect / install CLI path | Path or install progress; not stuck |
| 5 | Chat | Send prompt when CLI+auth OK | Stream or clear error |
| 6 | Settings | Theme, locale vi/en, permissions | Persist after restart (spot-check) |
| 7 | Skills | Settings → Skills list | Discovers `skills/` / user skills |
| 8 | Terminal | External terminal open | Opens at project cwd (fallback OK) |
| 9 | Git chip | Branch / dirty | Matches repo or honest empty |
| 10 | Update | Check update config | Repo `ngt-baor/Grok-buid-app` (this product) |
| 11 | Pack | `dist:win` when requested | `release/*.exe` exists; not committed to git |

## Product-specific notes

### Grok Build

- Auth: OIDC device-code **in app**; terminal login is fallback only.
- Runtime: Grok CLI under `~\.grok\bin\grok.exe`.
- Do not require Codex plugins.

### DiscordLyrics-class

- Media session → lyrics → Discord presence/status line.
- Verify permission / tray / auto-start only if those features exist in that repo.

## Failure reporting

Use **e2e-report-md** format. Include:

- App version (`package.json` / about UI)
- Repro steps
- Main vs renderer (if known from logs)
- Whether issue is agent-session blocker vs product bug

## Automation when available

- Prefer existing scripts: `BUILD-RELEASE.bat`, `npm run dist:win`.
- Chrome DevTools MCP (opt-in) for renderer DOM — not a substitute for main-process checks.
