---
name: mcp-fallback-map
description: >
  When shell/terminal is broken (terminal/create not implemented), map common
  tasks to MCP and non-shell tools. Use for "shell fail", "cannot git",
  "terminal not implemented", "no npm", "blocker runtime".
---

# mcp-fallback-map

## Hard signal

```text
terminal/create not implemented
```

Implications: no `git`, PowerShell, `npm`, `mvnw`, Python, `monitor` subprocesses, subagents that need shell.

## Substitution table

| Wanted | Shell dead → use | Caveat |
|--------|------------------|--------|
| Read/write project files | Workspace file tools | Limited to allowed cwd |
| `git status` / commit / push | GitHub MCP: commits, `push_files`, branch, PR | Remote-only; local `.git` stale |
| `gh pr …` | `create_pull_request`, `pull_request_read`, … | Need MCP auth |
| CI logs | `get_job_logs`, `actions_*` | Cannot run tests locally |
| Browse localhost app | Chrome DevTools MCP if connected | App must already be running |
| Google Drive find/read | `google_drive__search`, `read_file` | **No** Docs/Sheets rich write |
| Design assets | Canva / Figma MCP; `image_gen` | Not Cowart |
| Excel results | **e2e-report-md** (md/csv) | Not xlsx binary |
| Install packages | **Blocked** | Tell user to run outside agent |
| Start FE/BE servers | **Blocked** | User starts; agent documents |

## Workflow when blocked

1. State blocker in one sentence (no retry loops on shell).
2. Continue work that does not need shell (edit files, MCP, docs).
3. Produce artifacts user can run later (`*.bat`, markdown steps).
4. Never claim tests passed if they were not executed.

## Ship code without shell

→ **yeet-grok Path B** + **push-source-safe**.

## What still fails completely

- Native build (`electron-builder`) inside agent
- Local DB migrations requiring CLI
- Anything needing interactive TTY

Offer the exact command block for the user to run in an external terminal.
