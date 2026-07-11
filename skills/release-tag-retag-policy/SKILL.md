---
name: release-tag-retag-policy
description: >
  Policy for GitHub release tags v0.1.x: when to cut, when retag is allowed,
  avoid destructive rewrite. Use for version tag, retag, GitHub Release.
---

# release-tag-retag-policy

## Version source of truth

- `package.json` `version` (e.g. `0.1.2`)
- Git tag: `v0.1.2` (leading `v`)
- Updater compares semver to `app.getVersion()`

## Cut a release

1. Bump version in `package.json` (+ lock / any embedded clientInfo version).
2. Build `dist:win` artifacts locally.
3. Push source (allowed paths only).
4. Create GitHub Release **tag** `vX.Y.Z` + attach `.exe`.
5. Confirm in-app update check sees it.

## Retag policy

| Situation | Allowed? |
|-----------|----------|
| Tag never downloaded / minutes old / broken asset only | Retag or replace assets with care; prefer delete-and-recreate Release **if** no wide installs yet |
| Tag already public + users may have updated | **No rewrite** — ship `vX.Y.Z+1` |
| Force-push tag on main history rewrite | Avoid; explain blast radius |

## Rules

- Prefer new patch version over moving tags.
- Never put secrets in Release notes.
- Coordinate version strings: package ↔ tag ↔ installer name.

## Verify

- Release page shows tag + exe.
- Older build’s `update:check` offers newer version.
