---
name: storage-hygiene-indexeddb
description: >
  Debug IndexedDB/LevelDB WAL bloat and safe purge/flush for Grok Build and
  official Grok Desktop x.com origin. Use for disk full, IDB balloon, storage
  hygiene, fix:idb-bloat.
---

# storage-hygiene-indexeddb

## Code / docs map

| Piece | Path |
|-------|------|
| Hygiene | `electron/storage-hygiene.cjs` |
| IPC | `storage:report`, `storage:hygiene`, `storage:purge-official-xcom`, `storage:flush` |
| Bug write-up | `docs/BUG-IndexedDB-WAL-balloon.md` |
| Scripts | `scripts/fix-grok-indexeddb-bloat.ps1`, `cleanup-grok-indexeddb.ps1` |
| npm | `fix:idb-bloat`, `fix:idb-bloat:clean-only` |

## Paths

| App | userData |
|-----|----------|
| Grok Build | `%APPDATA%\grok-build-app` |
| Official Grok Desktop | `%APPDATA%\grok` |
| Known balloon | `%APPDATA%\grok\IndexedDB\https_x.com_0.indexeddb.leveldb` |

Thresholds (code): warn ~200MB, purge ~500MB, emergency ~2GB.

## Safe order

1. `storage:report` / size check — do not delete blind.
2. Quit apps locking LevelDB when possible.
3. `storage:flush` on orderly quit (Build app).
4. Purge oversize/corrupt origins via hygiene IPC or scripts for official path.
5. Never delete `~\.grok\auth.json` or CLI bin as “IDB fix”.

## Rules

- Build app must **not** share userData with official `grok`.
- Chromium has no app-level `db.close`/`compactRange` — flush + clear + delete folder only.
- Shell dead: guide user to scripts; can still review hygiene code.

## Verify

- Report sizes drop after purge.
- App still starts; auth intact.
