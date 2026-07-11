---
name: windows-terminal-launch
description: >
  Debug opening external terminal at project cwd (Windows Terminal, PowerShell,
  cmd fallback). Use for Ctrl+`, shell:open-terminal, terminal not opening.
---

# windows-terminal-launch

## Code map

| Piece | Path |
|-------|------|
| IPC | `shell:open-terminal` in `main.cjs` |
| Settings | preferred terminal profile |
| Shortcut | Ctrl+\` |

## Expected

1. Resolve cwd = active project (or sensible fallback).
2. Try Windows Terminal → PowerShell → cmd per settings/availability.
3. No embedded PTY required (PTY deferred product-wise).

## Debug checklist

| Symptom | Check |
|---------|--------|
| Nothing opens | path to wt/powershell; permissions |
| Wrong directory | cwd arg; project not open |
| Flashes and closes | profile command error |
| Settings ignored | save prefs; restart |

## Rules

- External terminal ≠ agent shell tool (agent may still be blocked by `terminal/create`).
- Do not pass secrets on command line.
- Login must not depend on this path (device-code in-app).

## Verify

- Project open → Ctrl+\` → shell cwd is project root.
