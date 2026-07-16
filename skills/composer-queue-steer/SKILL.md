---
name: composer-queue-steer
description: >
  Implement Codex-style composer queue + steer (Chỉ dẫn) in Grok Build App.
  Use when adding follow-up queue while agent busy, chip UI, drain after turn,
  or mid-turn steer/interrupt.
---

# composer-queue-steer

## Spec

Read first: `docs/FEATURE-QUEUE-STEER.md`

## Code map

| Piece | Path |
|-------|------|
| Composer / isRunning send | `src/App.tsx` |
| Styles | `src/styles.css` |
| i18n | `src/i18n.ts` |
| Settings | `electron/settings.cjs` + Settings UI in App |
| Prompt IPC | `electron/preload.cjs` → `agent:prompt` |
| Main handler | `electron/main.cjs` `ipcMain.handle("agent:prompt")` |
| ACP | `electron/acp-bridge.cjs` |
| Feature map | `docs/CODEX-FEATURE-MAP.md` |

## Rules

1. **Queue first, steer second.** Queue is pure renderer + single-flight send.
2. One `agent:prompt` in flight max. Drain only after settle.
3. On hard error: **pause** queue (do not auto-drain).
4. On user Cancel: **keep** queue; do not auto-drain until explicit action.
5. Per-tab queues only (do not share across tabs).
6. Thin shell: do not reimplement agent loop; only schedule prompts.
7. Steer: try native ACP; else cancel + resend with clear user-facing note.
8. Labels VI: “Chỉ dẫn”, “Hàng đợi”, “Tắt tính năng đưa vào hàng đợi”.

## Implement checklist

- [ ] `queuedPrompts` state per tab
- [ ] Intercept submit when `isRunning && queueEnabled`
- [ ] Chip bar UI above composer
- [ ] Delete / edit chip
- [ ] Drain FIFO on successful turn end
- [ ] Settings toggle
- [ ] Chỉ dẫn button (P2)
- [ ] i18n strings
- [ ] Mark FEATURE doc + CODEX map ✅

## Verify

1. Start long prompt → while streaming type second message → chip appears, first continues.
2. Delete chip → not sent.
3. Let first finish → second auto-sends.
4. Cancel mid-run → queue remains.
5. Disable queue → busy submit does not enqueue.
