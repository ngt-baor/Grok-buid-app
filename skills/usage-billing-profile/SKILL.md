---
name: usage-billing-profile
description: >
  Debug credits billing, token usage logs, and profile stats/heatmap in Grok
  Build. Use for usage panel, credits vs tokens, profile:stats, heatmap, streak.
---

# usage-billing-profile

## Code map

| Piece | Path |
|-------|------|
| Usage | `electron/usage.cjs` · IPC `usage:get` |
| Profile | `electron/profile-stats.cjs` · `profile:stats`, `profile:record-turn` |
| UI | Settings Hồ sơ + usage modal |

## Two different metrics

| Metric | Source | Meaning |
|--------|--------|---------|
| **Credits** | xAI billing API | Spend/quota product units |
| **Tokens** | `~\.grok\logs\` (+ local activity) | Inference volume |

Never label credits as tokens or vice versa.

## Debug checklist

| Symptom | Check |
|---------|--------|
| Credits zero/error | auth; network; API shape change |
| Tokens empty | log path; parse filters; permissions |
| Heatmap flat | `profile:record-turn` not called; stats merge |
| Skills used wrong | skill name extraction from logs/turns |

## Rules

- Fail soft: show partial data + error string, do not crash shell.
- Do not cache billing tokens in repo.
- Profile is local analytics, not source of billing truth.

## Verify

- Signed-in: usage returns structured credits and/or clear error.
- After a turn: profile activity increments.
