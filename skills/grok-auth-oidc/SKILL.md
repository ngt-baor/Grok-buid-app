---
name: grok-auth-oidc
description: >
  Debug Grok Build OIDC device-code login, token refresh, logout, and
  ~/.grok/auth.json issues. Use for login fail, expired token, device code,
  auth:login, logout, CLI vs in-app auth.
---

# grok-auth-oidc

## Code map

| Piece | Path |
|-------|------|
| Device-code + poll | `electron/auth.cjs` |
| IPC | `auth:status`, `auth:login`, `auth:login-cli`, `auth:login-cancel`, `auth:logout` |
| Preload | `window.grokApp.getAuth/login/loginCli/cancelLogin/logout` |
| Token file | `~\.grok\auth.json` (shared with Grok CLI) |

## Expected flow (in-app)

1. `auth:login` → POST OIDC `/oauth2/device/code`.
2. UI shows user code + opens verification URL.
3. Poll token endpoint until success / expire / cancel.
4. Write `auth.json` in CLI-compatible shape.
5. `auth:status` reports signed-in.

Terminal `grok login` (`auth:login-cli`) is **fallback only**.

## Debug checklist

| Symptom | Check |
|---------|--------|
| Stuck “waiting” | Poll errors; cancel then retry; clock skew |
| Code expired | Restart login; shorter wait |
| Signed out after restart | File missing / unreadable / wrong path / bad JSON |
| CLI works, app doesn’t | App write path vs CLI path; permissions on `~\.grok` |
| App works, CLI doesn’t | Same `auth.json`; CLI binary channel |
| Logout incomplete | `auth:logout` must clear token file |

## Rules

- Never commit `auth.json`, paste refresh/access tokens into chat/logs/PRs.
- Prefer in-app device-code over forcing terminal login.
- If shell dead: inspect auth **code paths** and user-reported status; cannot run `grok login` in-agent.

## Verify

- Login → status signed-in → restart app → still signed-in.
- Logout → status signed-out → CLI also sees no token (spot-check).
