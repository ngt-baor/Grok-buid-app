# Feature: Queue + Steer (Codex-style follow-up)

> Status: **Planned** · Priority: **P1 (Queue) → P2 (Steer)**  
> Source: FB feedback (Đào Khôi Nguyên) + Codex desktop UI screenshots (2026-07)  
> Related: `docs/CODEX-FEATURE-MAP.md`

---

## 1. Problem

Hiện tại Grok Build App khi agent **đang chạy** (`isRunning` / stream ACP):

| User muốn | Hiện có |
|-----------|---------|
| Gõ follow-up tiếp theo | Phải chờ xong, hoặc Cancel rồi gửi lại |
| Cắt hướng mid-turn | Chỉ có Stop |
| Giữ nhiều prompt tuần tự | Không có hàng đợi |

Multi-tab **không** thay queue: tab mới = session/context khác; queue = **cùng thread**, tuần tự.

---

## 2. What Codex does (reference UI)

Từ screenshot Codex desktop (VI):

| UI element | Behavior |
|------------|----------|
| Agent **Đang suy nghĩ / Đang xử lý** | Turn hiện tại busy |
| Chip message phía trên composer (vd. `tại sao?`) | Message **đã queue**, chưa thành turn mới |
| Nút **Chỉ dẫn** | **Steer** — inject vào turn đang chạy |
| Thùng rác | Xóa khỏi queue |
| **Chỉnh sửa tin nhắn** | Edit text trong queue |
| **Tắt tính năng đưa vào hàng đợi** | Setting: tắt auto-queue |
| Placeholder **Yêu cầu thay đổi tiếp theo** | Composer nhận follow-up khi busy |
| Stop (■) | Cancel turn — **khác** queue/steer |

### Naming

| Community | Codex UI | Nghĩa |
|-----------|----------|--------|
| **Queue** | Hàng đợi / chip pending | Gửi **sau** khi turn hiện tại xong |
| **Steal / Steer** | **Chỉ dẫn** | Đưa instruction vào **turn đang chạy** |
| Cancel | Stop | Hủy turn, không auto-run queue item (policy dưới) |

---

## 3. Goal for Grok Build App

Ship UX gần Codex:

1. **P1 — Queue (an toàn, không phụ thuộc ACP mới)**  
   - Khi busy: Enter → enqueue (không block/double-send).  
   - Chip list phía trên composer.  
   - Edit / delete / reorder (reorder optional v1).  
   - Khi turn complete → auto-drain FIFO next item → `sendPrompt`.

2. **P2 — Steer / Chỉ dẫn**  
   - Nút trên chip: inject mid-turn.  
   - Prefer native ACP nếu có (`session/steer`, follow-up mid-prompt).  
   - Fallback: cancel + immediate new prompt với prefix interrupt (document as imperfect).

3. **Settings**  
   - `followUpMode`: `queue` (default) | `block` | `steer-on-send`  
   - Toggle “Tắt đưa vào hàng đợi” (map Codex menu).

---

## 4. Non-goals (v1)

- Multi-agent parallel queue across tabs (mỗi tab queue riêng là đủ).
- Cloud sync queue.
- Clone 100% Codex keyboard (Tab/Enter) — map phím riêng sau.
- True mid-tool interrupt nếu Grok CLI không hỗ trợ (không fake hoàn hảo).

---

## 5. Architecture

### 5.1 State (renderer, per active tab)

```ts
type QueuedPrompt = {
  id: string;
  text: string;
  images?: AttachmentImage[];
  files?: AttachmentFile[];
  createdAt: number;
  /** optional: mark as next steer candidate */
  preferSteer?: boolean;
};

// Per tab (store with session or React state keyed by tabId)
queuedPrompts: QueuedPrompt[];
queueEnabled: boolean; // from settings, default true
```

Persist: **optional** — v1 memory-only khi app open; v1.1 persist in `tabs:save-active` patch nếu muốn survive reload mid-run.

### 5.2 Send path (current)

```
Composer submit
  → window.grokApp.sendPrompt(payload)
  → IPC agent:prompt
  → AcpBridge.prompt() → session/prompt
```

### 5.3 Target send path

```
Composer submit
  if (!isRunning) → sendPrompt immediately
  else if (queueEnabled) → enqueue + show chip
  else if (followUpMode === 'steer-on-send') → steer(payload)
  else → ignore / toast “Agent đang chạy”

On turn end (agent complete / error terminal):
  if queue non-empty → dequeue → sendPrompt(next)
  (skip drain after hard error? — see policy)

Chip "Chỉ dẫn":
  → steer(item) → remove from queue (or keep?) → prefer remove
```

### 5.4 Files to touch

| Layer | File | Change |
|-------|------|--------|
| UI | `src/App.tsx` | Queue state, composer intercept, chip bar, drain on complete |
| Styles | `src/styles.css` | `.composer-queue`, chip, actions |
| i18n | `src/i18n.ts` | VI/EN: Chỉ dẫn, Hàng đợi, Tắt queue… |
| Settings | `electron/settings.cjs` + Settings UI | `queueEnabled`, `followUpMode` |
| Preload | `electron/preload.cjs` | Only if new IPC (`agent:steer`) |
| Main | `electron/main.cjs` | Optional `agent:steer` handler |
| Bridge | `electron/acp-bridge.cjs` | `steer()` if protocol supports; else document fallback |
| Types | `src/vite-env.d.ts` | API surface |
| Docs | this file + CODEX-FEATURE-MAP | Status ✅ when shipped |
| Skill | `skills/composer-queue-steer/SKILL.md` | Agent guidance |

### 5.5 Detect “turn done”

Reuse existing agent events:

- `agent:update` terminal / result of `sendPrompt` promise resolve/reject
- Ensure **single-flight**: only one `agent:prompt` in flight; drain after settle
- On reject: still decide drain vs pause queue (recommend: **pause queue** + badge error, user resume)

### 5.6 Steer implementation options

| Option | How | Quality |
|--------|-----|---------|
| **A. Native ACP** | New method if Grok agent supports mid-session user message | Best |
| **B. Cancel + prompt** | `agent:cancel` then `agent:prompt` with text | OK UX, waste partial work |
| **C. Append-only notification** | Write follow-up file / inject via unknown protocol | Avoid unless documented |

**v1 ship Queue only.** Steer button can call Option B with clear toast: “Đang hủy turn hiện tại và áp dụng chỉ dẫn”.

---

## 6. UX spec (match Codex screenshots)

### Queue chip bar (above composer)

```
┌─────────────────────────────────────────────────────────┐
│ ⠿  tại sao?                          [Chỉ dẫn] [🗑] [···]│
└─────────────────────────────────────────────────────────┘
│ Yêu cầu thay đổi tiếp theo…                    [Stop]   │
```

- Multiple chips stack vertically (max ~5 visible, scroll).
- Drag handle optional v1.1.
- Menu `···`: Chỉnh sửa · Tắt hàng đợi · (Gửi ngay = same as Chỉ dẫn in v1 if no true steer)

### Empty / idle

- No chip bar.
- Normal send.

### Settings copy (VI)

- “Đưa tin nhắn vào hàng đợi khi agent đang chạy” (default on)
- “Khi gửi trong lúc chạy: Hàng đợi | Chặn | Chỉ dẫn ngay”

---

## 7. Acceptance criteria

### Queue (P1)

- [ ] While streaming, submit text → appears as chip, composer clears, agent continues.
- [ ] Delete chip → not sent later.
- [ ] Edit chip → updated text used on drain.
- [ ] After successful turn end → next chip auto-sends in order.
- [ ] After Cancel → queue retained (do not auto-send until user sends or hits “Gửi hàng đợi”).
- [ ] Disable setting → submit while busy shows toast, no enqueue.
- [ ] Tab switch: each tab has independent queue.
- [ ] No double concurrent `agent:prompt`.

### Steer (P2)

- [ ] Chỉ dẫn on chip injects that text into active work (native or cancel+resend).
- [ ] Chip removed after steer applied.
- [ ] i18n VI/EN labels.

---

## 8. Implementation order (actionable)

1. **State + intercept submit** in `App.tsx` (`isRunning` branch).
2. **Chip UI** minimal (text + delete).
3. **Drain on prompt settle** (`.finally` of send / status listener).
4. **Edit chip** inline or small modal.
5. **Settings toggle** `queueEnabled`.
6. **Chỉ dẫn** button → cancel + send (document).
7. Probe Grok ACP for native steer; upgrade if available.
8. Update `CODEX-FEATURE-MAP.md` row status ✅.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Drain races double-send | Mutex / `promptInFlight` flag |
| Error turn drains bad state | Pause queue on error |
| Steer mid-tool leaves half-written files | Prefer queue; steer = advanced |
| Huge attachments in queue | Cap size; same as normal attach limits |
| Persist queue mid-crash | Optional; not blocking P1 |

---

## 10. Chat handoff summary (from product discussion)

- FB request: “Thêm queue và steal giống Codex”.
- Screenshots confirm: chip queue + **Chỉ dẫn** + edit + disable queue.
- “Steal” = community name for steer/interrupt, not a separate product feature.
- Do **Queue first**, Steer second.
- Multi-tab already exists; do not confuse with queue.

---

*Created 2026-07-16 for Grok Build App implementation handoff.*
