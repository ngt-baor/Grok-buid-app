---
name: git-panel-worktrees
description: >
  Debug Git branch chip, dirty/ahead/behind, status, and worktree list/open in
  Grok Build. Use for git chip wrong, worktrees, git:info, git:status.
---

# git-panel-worktrees

## Code map

| Piece | Path |
|-------|------|
| Logic | `electron/git.cjs` |
| IPC | `git:info`, `git:status`, `git:worktrees` |
| UI | composer/project chip + git panel |

## Checks

| Case | Expect |
|------|--------|
| Non-git folder | honest empty/error, no crash |
| Dirty tree | dirty flag true |
| Ahead/behind | vs upstream when set |
| Worktrees | list paths; open as project if supported |
| git missing | clear error (shell/git not installed) |

## Rules

- Read-only status by default; mutating git = user/agent tools, not silent chip.
- Shell-dead agent cannot run git — UI may still call main-process git if app host can.

## Verify

- Known repo: branch name matches `git branch`.
- Edit file → dirty updates after refresh.
