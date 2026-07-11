---
name: chrome-devtools-mcp-integration
description: >
  Debug opt-in Chrome DevTools MCP injection into ACP session/new for Grok
  Build. Use for chrome-devtools-mcp, browser tools missing, mcp:preview,
  Settings Agent MCP.
---

# chrome-devtools-mcp-integration

## Code map

| Piece | Path |
|-------|------|
| Builder | `electron/mcp-servers.cjs` |
| Flag | settings `chromeDevtoolsMcp` (+ package, headless, slim, isolated, noUsageStats) |
| IPC | `mcp:preview` |
| Inject | ACP `session/new` `mcpServers` list |

## Windows spawn note

`npx` is often a `.cmd` shim — code uses `cmd /c npx -y chrome-devtools-mcp@…`.

## Debug checklist

| Symptom | Check |
|---------|--------|
| Tools absent | setting off; session started before toggle — new session |
| Spawn fail | node/npx on PATH; cmd quoting |
| Too heavy | enable slim/headless flags |
| Privacy | `--no-usage-statistics` default on |

## Rules

- Opt-in only; do not force MCP on all users.
- Not a substitute for embed browser panel (Codex-like) — agent tools only.
- Shell dead: can review config; cannot verify live MCP spawn.

## Verify

- Enable in Settings → new agent session → MCP tools available.
- `mcp:preview` shows expected server command/args.
