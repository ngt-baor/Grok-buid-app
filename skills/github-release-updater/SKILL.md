---
name: github-release-updater
description: >
  Debug in-app update from GitHub Releases: check, download .exe, apply,
  semver compare, update repo resolution. Use for update button, updater.cjs,
  update:check, missing installer asset.
---

# github-release-updater

## Code map

| Piece | Path |
|-------|------|
| Logic | `electron/updater.cjs` |
| IPC | `update:check`, `update:download`, `update:cancel`, `update:apply` |
| Default repo | `ngt-baor/Grok-buid-app` (`DEFAULT_UPDATE_REPO`) |
| Override order | settings.updateGithubRepo → env → package.json → default |

## Expected flow

1. `update:check` → GitHub Releases latest → semver vs `app.getVersion()`.
2. Prefer asset `.exe` / `.msi`.
3. `update:download` with progress events.
4. `update:apply` opens installer (user completes install).

## Debug checklist

| Symptom | Check |
|---------|--------|
| No update found | No Release / tag not semver `v0.1.x` |
| Found but no download | Missing `.exe` asset on Release |
| Wrong repo | settings / `grokBuild.updateRepo` / hard fallback |
| Version always equal | local version already ≥ release; packaging version mismatch |
| Download abort | `update:cancel`; disk/network |

## Rules

- Update source public repo only; do not point at private harness dumps.
- Do not commit downloaded installers into git (`release/` local only).
- Confirm before changing default update repo string.

## Verify

- Release `vX.Y.Z` with Setup/Portable exe → older app sees update → download → apply launches installer.
