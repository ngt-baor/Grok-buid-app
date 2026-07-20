---
name: github-release-updater
description: >
  Debug in-app update from GitHub Releases: check, download .exe/.dmg, apply,
  semver compare, update repo resolution. Use for update button, updater.cjs,
  update:check, missing installer asset (Win or Mac).
---

# github-release-updater

## Code map

| Piece | Path |
|-------|------|
| Logic | `electron/updater.cjs` |
| IPC | `update:check`, `update:download`, `update:cancel`, `update:apply` |
| Default repo | `ngt-baor/Grok-buid-app` (`DEFAULT_UPDATE_REPO`) |
| Override order | env `GROK_BUILD_UPDATE_REPO` → package.json → default |

## Expected flow

1. `update:check` → GitHub Releases latest → semver vs `app.getVersion()`.
2. Prefer asset by OS:
   - **Windows:** Setup `.exe` → portable `.exe` → `.msi`
   - **macOS:** `.dmg` (prefer matching `arm64` / `x64`) → `.zip`
3. If newer version but **no** matching asset → status `update_no_asset` (message, open release page; no download).
4. `update:download` with progress events.
5. `update:apply`:
   - Windows: open installer `.exe`
   - macOS: `open` `.dmg` / `.zip` (mount or Finder)

## Dual-platform release rule

- **One** tag `vX.Y.Z` for both OS.
- Attach **Windows + macOS** assets to the same release.
- CI: `.github/workflows/release.yml` (tag push).

## Debug checklist

| Symptom | Check |
|---------|--------|
| No update found | No Release / tag not semver `v0.1.x` |
| Found but no download | Missing platform asset (Mac needs `.dmg`, Win needs `.exe`) |
| Status `update_no_asset` | Release only has other OS installers |
| Wrong repo | env / `grokBuild.updateRepo` / hard fallback |
| Version always equal | local version already ≥ release; packaging version mismatch |
| Download abort | `update:cancel`; disk/network |
| Mac Gatekeeper | unsigned DMG → Right-click Open |

## Rules

- Update source public repo only; do not point at private harness dumps.
- Do not commit downloaded installers into git (`release/` local only).
- Confirm before changing default update repo string.

## Verify

- Release `vX.Y.Z` with Setup exe **and** arm64 dmg → older app on each OS sees update → download → apply.
- Win-only release on Mac → `update_no_asset` message, not a failed `.exe` download.
