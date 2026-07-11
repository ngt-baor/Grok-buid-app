---
name: gh-address-comments-grok
description: >
  Process PR review comments: list threads, fix code, reply, resolve threads.
  Use GitHub MCP pull_request_read / review_write / issue comments. Use for
  "address review", "PR comments", "gh-address-comments", "resolve review".
---

# gh-address-comments-grok

## Steps

### 1. Load review surface

| Data | MCP |
|------|-----|
| Review threads | `pull_request_read` → `get_review_comments` |
| Top-level PR comments | `pull_request_read` → `get_comments` |
| Reviews summary | `pull_request_read` → `get_reviews` |
| Diff context | `get_diff` / `get_files` if needed |

Prefer **unresolved** threads. Skip outdated unless still valid.

### 2. Triage each thread

| Verdict | Action |
|---------|--------|
| Valid bug / clear improvement | Fix code + short reply |
| Style nit optional | Fix if cheap; else reply with rationale |
| Wrong / out of date | Reply with evidence; do not drive-by refactor |
| Needs product decision | Reply asking user; do not invent product rules |

### 3. Implement

- One logical commit group per related set of comments when possible.
- Match existing style; no drive-by renames.
- Ship with **yeet-grok** on the PR branch.

### 4. Reply + resolve

- Reply on the thread (issue comment on PR or review reply tools as available).
- Resolve when fixed: `pull_request_review_write` method `resolve_thread` with `threadId` from step 1.
- Do not resolve threads you did not address.

### 5. Summary to user

```markdown
| Thread | Verdict | Change |
|--------|---------|--------|
| … | fixed / deferred / disagreed | file:line |
```

Unresolved remaining: list explicitly.

## Shell dead

- Read/reply/resolve: MCP OK.
- Code: workspace edit + **yeet-grok Path B**.

## Do not

- Mass-resolve without fixes
- Argue aggressively in-thread; be factual
- Push secrets while “fixing” a comment about env
