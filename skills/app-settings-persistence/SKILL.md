---
name: app-settings-persistence
description: >
  Debug Grok Build settings load/save/migrate under %APPDATA%\grok-build-app.
  Use for settings reset, locale not saving, settings.json, settings:save.
---

# app-settings-persistence

## Code map

| Piece | Path |
|-------|------|
| Settings | `electron/settings.cjs` |
| IPC | `settings:get`, `settings:save` |
| On disk | `%APPDATA%\grok-build-app\settings.json` |

## Typical keys

- theme, locale, grok path, always-approve, terminal prefs
- updateGithubRepo, chromeDevtoolsMcp*
- personalization / model defaults as implemented

## Debug checklist

| Symptom | Check |
|---------|--------|
| Revert on restart | save not called; write fail; wrong userData |
| Partial save | merge patch vs replace whole file |
| Corrupt JSON | load fallback defaults; report once |
| Migration | new fields default without wiping old |

## Rules

- Never store raw OIDC tokens in settings.json (tokens live `~\.grok\auth.json`).
- userData = `grok-build-app`, not official `grok`.
- Validate types on save when adding keys.

## Verify

- Change locale + theme → restart → both persist.
- Invalid file → app starts with defaults.
