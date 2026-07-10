# Bug Report: IndexedDB LevelDB WAL balloon (~60 GB)

## Issue Description

| | |
|---|---|
| **VI** | File log LevelDB (WAL) của Grok Desktop (Electron/Chromium) phình to bất thường (~59 GB), làm đầy ổ C. |
| **EN** | LevelDB Write-Ahead Log (`.log`) under IndexedDB grows without bound (~59 GB), exhausting disk space on drive C. |

## Technical Details

| Field | Value |
|-------|--------|
| **Target path** | `%APPDATA%\grok\IndexedDB\https_x.com_0.indexeddb.leveldb\*.log` |
| **Engine** | Chromium IndexedDB → LevelDB WAL |
| **Symptom** | `.log` grows continuously; no flush/compaction to `.ldb` |

## Root Cause (hypotheses)

1. LevelDB corruption or abrupt disconnect while syncing `x.com` data.
2. Infinite write loop / connection not closed properly → WAL never compacted into SSTables.
3. Origin-partitioned storage for `https://x.com` replaying failed writes.

## Temporary fix (script)

```powershell
cd D:\grok-buid-app
npm run fix:idb-bloat
# or clean only (no restart):
npm run fix:idb-bloat:clean-only
```

Script: `scripts/fix-grok-indexeddb-bloat.ps1`

1. Force-kill `grok.exe`
2. Delete `%APPDATA%\grok\IndexedDB\https_x.com_0.indexeddb.leveldb`
3. Optionally restart Grok Desktop

Safer read-only check (warns if process still running): `scripts/cleanup-grok-indexeddb.ps1`

## Permanent fix (this repo — Grok Build App)

Implemented in `electron/storage-hygiene.cjs` + `electron/main.cjs`:

| Mitigation | Implementation |
|------------|----------------|
| **Orderly DB close / flush on quit** | `session.flushStorageData()` in `hygieneOnWillQuit()`; `before-quit` runs async shutdown before `app.exit` |
| **No shared profile with official Grok** | `app.setPath("userData", %APPDATA%\grok-build-app)` — never writes into `%APPDATA%\grok` |
| **Periodic size check** | Every 10 minutes: scan IDB origins; auto-purge if ≥ 500 MB or corrupt |
| **Startup emergency purge** | If any origin / official x.com IDB ≥ 2 GB → purge before windows open |
| **Rebuild corrupt / oversize IDB** | `clearStorageData({ storages: ['indexdb'] })` + delete LevelDB folder on disk |
| **Official x.com balloon helper** | Can purge `%APPDATA%\grok\IndexedDB\https_x.com_*` when not locked |
| **UI** | Ctrl+K → “Clean IndexedDB bloat”; badge when official path needs purge |

### Note on `db.close()` / `compactRange()`

Chromium does **not** expose LevelDB `db.close()` or `compactRange()` to Electron app code. The supported equivalents are:

1. `session.flushStorageData()` on quit
2. `session.clearStorageData({ origin, storages: ['indexdb'] })` when corrupted/oversize
3. Delete the origin folder under `userData/IndexedDB/` when safe

### Thresholds

| Level | Size | Action |
|-------|------|--------|
| Warn | ≥ 200 MB | Log / report |
| Purge | ≥ 500 MB or corrupt | Auto rebuild |
| Emergency | ≥ 2 GB | Startup purge |

## Distinction: this repo vs official Grok Desktop

| App | User data path | Notes |
|-----|----------------|--------|
| **Official Grok Desktop** | `%APPDATA%\grok\` | Bug path (`https_x.com_0…`) |
| **Grok Build App** (this project) | `%APPDATA%\grok-build-app\` | Local chat; hygiene module + no x.com webview by design |
| **Grok CLI** | `%USERPROFILE%\.grok\` | Sessions/logs; not IndexedDB |

## From the app UI

1. `Ctrl+K` → **Clean IndexedDB bloat (x.com LevelDB WAL)**
2. Or click the red **IDB bloat …** badge in the header when present

Close official Grok Desktop first if purge fails (file locks on LevelDB).
