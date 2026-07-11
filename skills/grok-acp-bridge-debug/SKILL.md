---
name: grok-acp-bridge-debug
description: >
  Debug Grok agent ACP stdio bridge: session/new, session/prompt, stream and
  tool events, cancel, permissions. Use for agent not starting, no stream,
  stuck tools, acp-bridge, session/update.
---

# grok-acp-bridge-debug

## Code map

| Piece | Path |
|-------|------|
| Bridge | `electron/acp-bridge.cjs` |
| IPC start/prompt | `agent:start`, `agent:new-session`, `agent:prompt`, `agent:cancel`, `agent:stop` |
| Permission reply | `agent:permission-response` |
| MCP inject | `electron/mcp-servers.cjs` → `session/new` `mcpServers` |
| CLI | `~\.grok\bin\grok.exe` · settings grok path |

## Lifecycle

1. `agent:start` — spawn CLI stdio, handshake.
2. `agent:new-session` — cwd = project (or standalone).
3. `agent:prompt` — user turn; stream `session/update` to renderer.
4. Tools → optional permission modal → `agent:permission-response`.
5. `agent:cancel` / `agent:stop` — end turn or process.

## Debug checklist

| Symptom | Check |
|---------|--------|
| Start fails | CLI installed? path? auth? |
| Handshake hang | stdout/stderr protocol; wrong binary |
| No stream | event wiring main → webContents; dead process |
| Wrong cwd | project open vs standalone path |
| Tools never run | permission always deny; MCP misconfig |
| Double session | tab switch without stop; single-flight rules |
| clientInfo.version | keep in sync with app version (`package.json`) |

## Rules

- Thin shell: do not reimplement agent logic in Electron.
- Log redaction: no tokens in bridge logs.
- Shell-dead agent sessions: can still reason about code; cannot spawn CLI here.

## Verify

- Open project → start agent → short prompt → stream + complete.
- Cancel mid-turn stops cleanly.
- Permission Allow once works for a single tool.
