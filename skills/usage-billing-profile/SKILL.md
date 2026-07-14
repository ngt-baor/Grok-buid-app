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

## Three different metrics

| Metric | Source | Meaning |
|--------|--------|---------|
| **Weekly SuperGrok** | `GET /v1/billing?format=credits` (`creditUsagePercent`, weekly period) | Shared pool Chat/Build/Imagine/Voice — **primary gate** (web Settings → Usage) |
| **Credits** | `GET /v1/billing` (`monthlyLimit` / period) | Build billing period (usually monthly) |
| **Tokens** | `~\.grok\logs\` (+ local activity) | Inference volume (not official quota) |

Never label credits as tokens or vice versa. Prefer **weekly remaining %** on the quota chip.

**Context absolute (client request):** sidebar footer + usage modal show `used / limit` like `2.9K / 500K` from `usage.context` (promptTokens / contextWindow). Not billing. Warn at ≥65% used, crit at ≥85%. Credits modal row may also show absolute used/limit when API provides numbers.

## Debug checklist

| Symptom | Check |
|---------|--------|
| Credits zero/error | auth; network; API shape change |
| Weekly missing / — | try `?format=credits`; check `errors.weekly`; auth; period type |
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
