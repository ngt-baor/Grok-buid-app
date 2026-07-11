---
name: session-tabs-state
description: >
  Debug project sessions, multi-tabs, drafts, and single-flight background
  turns when switching project/tab. Use for lost chat, wrong tab, draft not
  saving, background turn, tabs:create.
---

# session-tabs-state

## Code map

| Piece | Path |
|-------|------|
| Sessions store | `electron/sessions.cjs` |
| IPC | `tabs:create/switch/close/save-active/save-tab`, `project:list-sessions`, `project:open` |
| Standalone | `standalone:*` (no folder chat) |
| UI | `src/App.tsx` tab model + single-flight |

## Persistence

- Under `%APPDATA%\grok-build-app\project-sessions\` (app userData).
- Drafts/messages bound to project path + tab id.

## Single-flight (product rule)

- Switching project/tab while agent runs: **old turn continues**; do not spill stream into wrong tab.
- UI should show background/running state on the originating tab.

## Debug checklist

| Symptom | Check |
|---------|--------|
| Empty after restart | save path; corrupt JSON; wrong project key |
| Draft lost | `tabs:save-active` timing; unmount race |
| Messages on wrong tab | stream handler not keyed by tab/session id |
| Double agents | start without stop; missing single-flight |
| Standalone vs project | `standalone:is` / path confusion |

## Rules

- Do not store sessions in repo tree.
- No secrets in persisted drafts if avoidable.
- Changing session schema: migrate or version blob.

## Verify

- Two tabs → prompt each → restart → both restored.
- Start turn → switch tab → completion stays on original tab.
