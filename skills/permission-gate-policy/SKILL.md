---
name: permission-gate-policy
description: >
  Debug tool permission modal Allow once / Always session / Deny and
  always-approve settings. Use for permission stuck, auto-approve, agent
  permission-response, safety gate.
---

# permission-gate-policy

## Code map

| Piece | Path |
|-------|------|
| IPC | `agent:permission-response` |
| Settings | always-approve / permission defaults (`settings`) |
| Bridge | permission requests from ACP → main → modal |
| UI | permission modal in `App.tsx` |

## Modes

| Choice | Effect |
|--------|--------|
| Allow once | This request only |
| Always (session) | Same class for session lifetime |
| Deny | Reject tool |
| Settings always-approve | Global convenience — **dangerous** if broad |

## Debug checklist

| Symptom | Check |
|---------|--------|
| Modal never shows | always-approve on; event not forwarded |
| Modal loops | response id mismatch; bridge timeout |
| Deny still runs | handler ignore; race |
| Too many prompts | session always not applied |

## Rules

- Default safe: do not expand always-approve silently.
- Destructive tools (rm, push --force, secrets) — never auto-allow without explicit user setting.
- Log permission decisions without tool secret payloads.

## Verify

- With always-approve off: tool triggers modal → Allow once → proceeds.
- Deny → tool fails closed; agent continues or reports error.
