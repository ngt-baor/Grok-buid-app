---
name: secret-scan-release-guard
description: >
  Pre-push / pre-release secret and privacy scan for Grok Build: tokens, .env,
  auth.json, personal paths, harness files. Use before yeet, release, push_files.
---

# secret-scan-release-guard

## Always block

| Pattern / path | Why |
|----------------|-----|
| `auth.json`, `.env*`, API keys | Credentials |
| `AGENTS.md`, `.agents/`, `MEMORY.md` | Personal harness |
| `C:\Users\<name>\.grok\sessions` in content | Machine-local |
| `_diag_*.js` | Personal diagnostics |
| Private tokens in source comments | Leak |

## Scan steps

1. List files in ship set (git staged or MCP file list).
2. Name check against **push-source-safe** blocked list.
3. Content grep (text files): `api_key`, `secret`, `Bearer `, `refresh_token`, `BEGIN PRIVATE`, `.grok\\sessions`.
4. Fail closed: remove from ship set; tell user.

## Rules

- Run before **yeet-grok** / `release:push` / GitHub `push_files`.
- False positive possible — user can override explicitly, not silently.
- Do not print full secret values in the report; mask.

## Verify

- Intentional dummy `AKIA…` in a staged file → scan catches before push.
