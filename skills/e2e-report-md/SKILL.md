---
name: e2e-report-md
description: >
  Record E2E / QA results as markdown and optional CSV when Excel binary write
  is blocked (no Python/openpyxl, terminal/create fail). Use for "E2E report",
  "ghi testcase", "Template_TestCase", "không ghi xlsx".
---

# e2e-report-md

## When

- User wants test results in spreadsheet template **but** shell/Python/openpyxl unavailable.
- Or results should live in git-friendly text.

## Do not

- Claim you wrote `.xlsx` binary if you did not.
- Invent PASS/FAIL without a run or user-provided evidence.
- Store secrets/tokens in reports.

## Output layout (repo-relative)

Prefer:

| File | Purpose |
|------|---------|
| `docs/e2e/<date>-summary.md` | Human report: env, PASS/FAIL, blockers |
| `docs/e2e/<date>-cases.csv` | Rows importable to Excel later |
| Optional link from `docs/e2e/README.md` | Index |

If `docs/e2e/` missing, create it.

## Summary markdown template

```markdown
# E2E report — YYYY-MM-DD

## Environment
| Item | Value |
|------|-------|
| FE | |
| BE | |
| status | |
| User | |
| Build / commit | |

## PASS
| Flow | Notes | Evidence |
|------|-------|----------|
| | | |

## FAIL / blocked
| Flow | Error | Blocker |
|------|-------|---------|
| | | |

## Not run
| Flow | Reason |
|------|--------|

## Next actions
1. …
```

## CSV template (Excel-importable)

Header row (UTF-8):

```text
id,module,title,steps,expected,actual,status,severity,notes
```

- `status`: `PASS` | `FAIL` | `BLOCKED` | `SKIP`
- One case per row; escape quotes per CSV rules.

## Later binary fill

When shell works:

1. Open template xlsx with skill `xlsx` / openpyxl.
2. Import CSV or map columns from `docs/e2e/*-cases.csv`.
3. Do not reverse-delete markdown — keep as audit trail.

## Runtime blockers to log explicitly

| Fact | Typical detail |
|------|----------------|
| Shell | `terminal/create` not implemented |
| Excel | no Python/openpyxl |
| Servers | FE/BE not started |

If blocked: still write the report with status `BLOCKED` and facts table — that **is** the deliverable.
