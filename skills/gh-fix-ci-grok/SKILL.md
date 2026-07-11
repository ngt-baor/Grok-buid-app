---
name: gh-fix-ci-grok
description: >
  Diagnose and fix GitHub Actions / CI failures on a PR or branch. Read workflow
  runs and job logs via GitHub MCP, patch code or workflow YAML, re-run failed
  jobs. Use for "CI red", "Actions failed", "fix CI", "gh-fix-ci".
---

# gh-fix-ci-grok

## Inputs

- `owner`, `repo`, optional `pullNumber` or branch name.
- Prefer the PR that is failing if the user is on a PR thread.

## Steps

### 1. Locate failure

| Goal | GitHub MCP |
|------|------------|
| PR checks | `pull_request_read` method `get_check_runs` or `get_status` |
| Workflow runs | `actions_list` → `list_workflow_runs` (filter branch / status) |
| Jobs | `actions_list` → `list_workflow_jobs` |
| Logs | `get_job_logs` with `failed_only=true` + `run_id`, or single `job_id` |
| Run detail | `actions_get` → `get_workflow_run` / `get_workflow_job` |

### 2. Classify root cause

| Class | Examples | Fix locus |
|-------|----------|-----------|
| Code | compile, type, unit test | `src/`, `electron/`, tests |
| Workflow | wrong node version, path, secrets | `.github/workflows/*` |
| Env | missing secret, permissions | tell user — do not invent tokens |
| Flaky | timeout, race | retry once; if repeats, harden test |

### 3. Fix

- Minimal patch that addresses the log error.
- Do not disable checks with `continue-on-error` or delete jobs to “make green” unless user asks.
- Do not use `--no-verify` style bypasses.

### 4. Ship fix

- Use **yeet-grok** (shell or MCP) on the same branch.
- Re-run: `actions_run_trigger` method `rerun_failed_jobs` or `rerun_workflow_run`.

### 5. Report

```text
Failure: <job> — <one-line error>
Cause: …
Change: <files>
Re-run: <run id or URL>
```

## When shell is dead

- Logs + re-run: MCP only (OK).
- Code fix: write files in workspace; ship via **yeet-grok Path B**.
- Cannot run `npm test` / `mvnw` locally — say so; rely on Actions after push.

## Out of scope

- Buying GitHub minutes / org policy
- Approving deploy protection rules without user
