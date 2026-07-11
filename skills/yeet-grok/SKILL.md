---
name: yeet-grok
description: >
  Ship code to GitHub: stage safe files, commit, push, open a PR. Prefer local
  git when shell works; when terminal/create fails use GitHub MCP
  (create_branch, push_files, create_pull_request). Use for "yeet", "ship",
  "push and PR", "commit push open PR".
---

# yeet-grok

Ship a clean change set to GitHub without dragging harness/secrets.

## Preconditions

1. Know **owner/repo** (this app: `ngt-baor/Grok-buid-app`).
2. Run **push-source-safe** rules first (or read `PUSH-CHECKLIST.md`).
3. Prefer a feature branch; avoid force-push to `main` unless user insists.

## Path A — shell works

```text
git status
git branch --show-current
# stage only allowed paths
git add electron/ src/ public/ assets/ package.json package-lock.json README.md PROJECT.md docs/ skills/ scripts/
# unstage anything blocked (AGENTS.md, .agents/, auth, node_modules, dist, release)
git commit -m "<concise why>"
git push -u origin HEAD
# open PR
gh pr create --fill   # or GitHub MCP create_pull_request
```

Confirm before: force-push, push to `main` with large dump, amend published commits.

## Path B — shell dead (`terminal/create` not implemented)

Do **not** pretend local git ran. Use GitHub MCP:

| Step | Tool (typical) | Notes |
|------|----------------|-------|
| 1. Baseline | `list_commits` / `get_file_contents` | Know remote SHA / skeleton state |
| 2. Branch | `create_branch` | From default branch |
| 3. Files | `push_files` or `create_or_update_file` | Text content only; existing files need correct `sha` for update |
| 4. PR | `create_pull_request` | `head` = new branch, `base` = `main` |

### Limits of Path B

- Does **not** sync local `.git`.
- Bad for huge trees / binaries / `node_modules`.
- Prefer batches of source files only.
- Tell user: remote advanced via MCP; local still needs `git pull` later.

## Commit message

- One short subject line: what changed and why.
- No secrets, no full file dumps in body.

## PR body (minimum)

```markdown
## Summary
- …

## Test plan
- [ ] …
```

## Done criteria

- [ ] No blocked paths in the ship set
- [ ] Branch on remote
- [ ] PR URL returned to user
- [ ] If Path B: stated that local git was not updated
