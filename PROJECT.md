# Grok Build App

> Desktop shell cho Grok Build — dùng Grok giống Codex: cửa sổ riêng, mở project, chat, tool approval, diff, và gắn Harness Engineering.

| | |
|---|---|
| **Tên thư mục** | `grok-buid-app` (hoặc clone path tuỳ máy) |
| **Tên sản phẩm gợi ý** | Grok Build App / Grok Desktop |
| **Loại** | Desktop application (Windows-first) |
| **Vai trò** | UI + bridge quanh Grok runtime sẵn có — **không** thay model, **không** viết lại agent từ zero |
| **Repo** | https://github.com/ngt-baor/Grok-buid-app |
| **Trạng thái code** | **MVP Phase 0+1 skeleton đã scaffold** tại repo này (Electron + ACP). Xem [README.md](./README.md). |

---

## 0. Implementation status (2026-07-10)

| Hạng mục | Status | Ghi chú |
|----------|--------|---------|
| Scaffold app | Done | Electron + Vite + React + TypeScript |
| Open project / recent | Done | Dialog + recent remove + `%APPDATA%\grok-build-app\settings.json` |
| ACP bridge | Done | `electron/acp-bridge.cjs` → `grok agent stdio` (handshake verified) |
| Chat + stream updates | Done | `session/prompt` + `session/update` timeline |
| Permission modal | Done | Allow once / Always (session) / Deny |
| Harness detect + panel | Done | Badge, domains, runbooks search, checklist, privacy banner |
| Settings (grok, model, theme, terminal, profile) | Done | Hồ sơ · Cá nhân hóa · Chung · Quyền · Agent |
| Terminal ngoài | Done | Ctrl+` · WT / PowerShell / cmd (PTY embed vẫn deferred) |
| Diff viewer / file tree | Done | Right panel + Explorer reveal |
| Git / worktrees | Done | Branch chip dirty/upstream + status + worktree open |
| Multi-session tabs | Done | Sidebar sessions + history section |
| Cross-project background turn | Done | Đổi project khi agent chạy → vẫn chạy; banner + tag sidebar; single-flight |
| Codex-like empty UI | Done | 4 starter cards + composer chips |
| Feature map vs Codex | Done | [docs/CODEX-FEATURE-MAP.md](./docs/CODEX-FEATURE-MAP.md) |
| PTY embed TUI | Deferred | Dùng terminal ngoài; PTY sau nếu cần |
| Tauri shell | Deferred | Rust đã cài trên máy; MVP ship Electron trước |
| Installer (.exe) | Pending | electron-builder sau |
| Chrome DevTools MCP | Done | Settings → Agent → opt-in inject `chrome-devtools-mcp` via ACP `mcpServers` |

**Chạy ngay:**

```powershell
cd D:\grok-buid-app
npm install
npm run dev
```

---

## 1. Công dụng (dùng để làm gì)

### 1.1 Vấn đề hiện tại

- Grok Build chạy chủ yếu trong **terminal/TUI**.
- Codex-like workflow (mở folder, chat, xem tool, approve, diff) kém trực quan khi chỉ có terminal.
- Harness Engineering (`AGENTS.md`, `.agents/`) đã có trong project, nhưng thiếu **UI cố định** để luôn bật đúng project / đúng quy trình.

### 1.2 Giá trị mang lại

| Công dụng | Mô tả |
|-----------|--------|
| **App desktop độc lập** | Không phụ thuộc cửa sổ terminal host; mở app là làm việc. |
| **Làm việc theo project** | Chọn folder (`cwd`) → agent chạy trong đúng workspace. |
| **Chat agent có timeline** | Prompt, reasoning tóm tắt, tool calls, kết quả — nhìn được như IDE agent. |
| **Kiểm soát an toàn** | Approve / deny shell, ghi file, network (permission UI). |
| **Gần Codex** | Diff, mở file, multi-session, settings, usage. |
| **Harness mode** | Tự nhận project có `.agents/index.md` / `AGENTS.md` → bật quy trình orient → execute → verify → distill → record → reuse. |
| **Tái dùng Grok runtime** | Auth OIDC, model, skills, tools, subagent đã có ở `grok` CLI — app chỉ bọc. |

### 1.3 Không phải công dụng của project này

- Không train / fine-tune model.
- Không thay xAI API bằng backend riêng (trừ khi sau này BYOK).
- Không reverse-engineer trái phép binary private nếu có API/CLI chính thức.
- Không aim “clone 100% Codex” ngay phase đầu — aim **đủ dùng hằng ngày**.

---

## 2. Mục tiêu theo giai

### Mục tiêu sản phẩm

> Một app Windows mở được project, chat với Grok Build, thấy tool/diff, gắn harness, dùng ổn định mỗi ngày.

### Mục tiêu kỹ thuật

1. **Thin shell**: UI mỏng, logic agent ở Grok CLI / agent mode.
2. **Stable bridge**: protocol rõ (stdio / local HTTP / ACP-style events).
3. **Safe by default**: không auto-approve destructive tools.
4. **Harness-aware**: detect & surface project rules/memory/runbook.
5. **Maintainable**: khi `grok` update, bridge dễ sửa, không rewrite UI.

---

## 3. Đối tượng người dùng & kịch bản

### 3.1 Persona

- Dev solo trên Windows.
- Đã dùng Grok CLI + Codex/Claude-style agents.
- Có harness riêng (`ban`, global AGENTS, skills).

### 3.2 User stories

1. **Mở app → chọn project** → chat “fix bug login” → agent sửa + verify.
2. **Project có harness** → app hiện badge “Harness V2” và agent đọc `.agents/index.md`.
3. **Tool nguy hiểm** (shell, xóa file, git push) → popup approve.
4. **Xem diff** trước khi accept thay đổi.
5. **Nhiều session** song song (2 project hoặc 2 task).
6. **Xem usage / gói** (nếu bridge lấy được từ billing/CLI).

---

## 4. Kiến trúc tổng thể

```
┌──────────────────────────────────────────────┐
│  Desktop UI (Tauri + Web frontend)           │
│  - Project picker, chat, timeline            │
│  - File tree, diff viewer, settings          │
│  - Permission prompts, harness panel         │
└────────────────────┬─────────────────────────┘
                     │ IPC (Tauri commands / events)
┌────────────────────▼─────────────────────────┐
│  Agent Bridge (Rust / Node helper)           │
│  - Spawn / connect Grok agent                │
│  - Stream tokens + tool events               │
│  - Map permissions UI ↔ agent policy         │
│  - Session store (local)                     │
└────────────────────┬─────────────────────────┘
                     │ stdio / subprocess / local API
┌────────────────────▼─────────────────────────┐
│  Grok Build runtime (có sẵn trên máy)        │
│  - grok.exe / agent mode                     │
│  - Auth (~/.grok/auth.json)                  │
│  - Skills, tools, models                     │
└──────────────────────────────────────────────┘
                     │
                     ▼
              xAI / Grok cloud
```

### 4.1 Nguyên tắc

| Nguyên tắc | Ý nghĩa |
|------------|---------|
| **CLI is source of truth** | Auth, model list, tools ưu tiên từ Grok, không duplicate. |
| **UI never invents agent logic** | UI không tự gọi tool nguy hiểm ngoài bridge. |
| **Project = cwd** | Mọi session gắn một absolute path project. |
| **Private local data** | Session logs, memory pointers — không push secret. |

### 4.2 Stack đề xuất

| Lớp | Công nghệ | Lý do |
|-----|-----------|--------|
| Shell | **Tauri 2** | Nhẹ hơn Electron trên Windows, ship 1 app |
| UI | React hoặc Svelte + TypeScript | Chat/diff UI nhanh |
| Bridge | Rust (trong Tauri) hoặc Node sidecar | Spawn process, PTY optional |
| Agent | `grok` CLI / `grok agent` / headless stream | Tái dụng |
| State | SQLite hoặc JSON under `%APPDATA%\grok-build-app` | Session local |
| Optional PTY | `portable-pty` / conpty | Phase 0 embed terminal |

**Không chọn Electron làm mặc định** trừ khi cần ecosystem plugin cực lớn — Tauri đủ cho app này.

---

## 5. Tính năng chi tiết

### 5.1 Core (MVP)

| ID | Tính năng | Mô tả |
|----|-----------|--------|
| F01 | Launch & auth status | Hiện đã login Grok chưa; deep-link/hướng dẫn `grok login` nếu chưa |
| F02 | Open project | Dialog chọn folder; lưu recent projects |
| F03 | Chat session | Gửi prompt, stream response |
| F04 | Tool timeline | List tool calls (read, shell, edit…) + status |
| F05 | Permission gate | Approve/Deny theo loại tool |
| F06 | Working directory binding | Session luôn chạy với `cwd` = project |
| F07 | Stop generation | Hủy turn đang chạy |
| F08 | Basic settings | Path tới `grok.exe`, model mặc định, theme |

### 5.2 Codex-like (Post-MVP)

| ID | Tính năng | Mô tả |
|----|-----------|--------|
| F10 | Diff viewer | Side-by-side / unified diff trước khi apply (nếu bridge hỗ trợ) |
| F11 | File tree + open file | Xem & mở file trong project |
| F12 | Multi-session tabs | Nhiều hội thoại / project |
| F13 | Session history | Resume session ID Grok nếu API cho phép |
| F14 | Usage panel | Credits / period (best-effort từ CLI/log/API) |
| F15 | Command palette | Ctrl+K mở project, new chat, settings |

### 5.3 Harness mode

| ID | Tính năng | Mô tả |
|----|-----------|--------|
| H01 | Detect harness | Có `AGENTS.md` và/hoặc `.agents/index.md` |
| H02 | Harness badge | UI hiện “Harness V2.1” + path |
| H03 | Domain hints | Hiển thị domain routing gợi ý (backend, security…) |
| H04 | Runbook search UI | Đọc `_index.json`, search symptom (read-only) |
| H05 | Verify tier label | Agent/report ghi Tier 1/2/3 trên message |
| H06 | Post-task checklist | Gợi ý record MEMORY / runbook (không tự ghi secret) |
| H07 | Privacy banner | Nhắc không commit `.agents/`, `MEMORY.md` |

### 5.4 Phase 0 fallback

Nếu streaming protocol agent chưa ổn:

- **Embedded terminal (PTY)** chạy full `grok` TUI trong panel.
- Vẫn có project picker + multi-window.
- Đủ “app desktop”, UX agent native làm sau.

---

## 6. Cách làm (kế hoạch triển khai)

### Phase 0 — Prototype “cửa sổ + project + terminal” (1–3 ngày)

**Mục tiêu:** Cảm giác app desktop, mở được đúng folder.

1. Tạo project Tauri tại `D:\grok-buid-app`.
2. UI: sidebar recent projects, nút Open Folder, panel terminal.
3. Spawn `grok` với `cwd` = project đã chọn (PTY).
4. Settings: path `grok.exe` (mặc định `%USERPROFILE%\.grok\bin\grok.exe`).
5. Đọc README nội bộ + build Windows.

**Done when:** Mở app → chọn `ban` → Grok chạy trong project đó.

### Phase 1 — Agent bridge + chat UI (1–2 tuần)

**Mục tiêu:** Chat không chỉ embed TUI.

1. Nghiên cứu protocol: `grok agent`, headless `--output-format streaming-json`, ACP nếu có.
2. Bridge parse events: text delta, tool_start, tool_result, error, done.
3. Chat UI + timeline.
4. Permission mode map sang flags Grok (`--permission-mode`, allow/deny rules).
5. Stop / max-turns controls.

**Done when:** Chat 1 task sửa file nhỏ, thấy tool calls, approve shell.

### Phase 2 — Diff, files, multi-session (2–4 tuần)

1. File tree + syntax preview.
2. Diff từ patch/tool edit events.
3. Tabs session + persistence local.
4. Error surfaces rõ (auth hết hạn, rate limit, usage pool).

**Done when:** Dùng hằng ngày thay một phần terminal cho task code.

### Phase 3 — Harness-aware + polish

1. Detect `.agents/`, panel harness.
2. Optional: checklist sau task (verify tier, record memory).
3. Auto-update app, tray, hotkeys, theme.
4. Installer (MSI/nsis).

**Done when:** Mở project harness → badge + gợi ý quy trình; app cài được trên máy khác (cùng user có `grok`).

---

## 7. Cấu trúc thư mục đề xuất

```text
D:\grok-buid-app\
├── PROJECT.md                 ← file này (tài liệu dự án)
├── README.md                  ← hướng dẫn build/run (tạo khi scaffold)
├── package.json               ← frontend + tauri scripts
├── src\                       ← UI (React/Svelte)
│   ├── components\
│   │   ├── Chat\
│   │   ├── Timeline\
│   │   ├── ProjectPicker\
│   │   ├── DiffViewer\
│   │   ├── PermissionModal\
│   │   └── HarnessPanel\
│   ├── lib\
│   │   ├── bridge.ts
│   │   ├── sessions.ts
│   │   └── harness.ts
│   └── styles\
├── src-tauri\                 ← Rust shell
│   ├── src\
│   │   ├── main.rs
│   │   ├── bridge\
│   │   ├── pty\
│   │   └── commands\
│   └── tauri.conf.json
├── docs\
│   ├── architecture.md
│   ├── protocol.md            ← contract events bridge ↔ UI
│   └── harness-integration.md
└── scripts\
    └── dev.ps1
```

---

## 8. Protocol bridge (hợp đồng dữ liệu — draft)

UI và bridge thống nhất event JSON (ví dụ):

```json
{ "type": "session.started", "sessionId": "...", "cwd": "D:\\proj" }
{ "type": "message.user", "text": "..." }
{ "type": "message.assistant.delta", "text": "..." }
{ "type": "tool.started", "id": "t1", "name": "run_terminal_command", "input": {} }
{ "type": "tool.pending_approval", "id": "t1", "risk": "high" }
{ "type": "tool.completed", "id": "t1", "ok": true, "summary": "..." }
{ "type": "error", "code": "auth_expired", "message": "..." }
{ "type": "session.ended", "reason": "completed" }
```

UI → bridge:

```json
{ "type": "user.approve_tool", "id": "t1" }
{ "type": "user.deny_tool", "id": "t1" }
{ "type": "user.cancel" }
{ "type": "user.set_model", "model": "grok-4.5" }
```

Chi tiết map sang CLI flags sẽ ghi trong `docs/protocol.md` khi implement.

---

## 9. Harness integration (cách app dùng khung vận hành)

### 9.1 Khi mở project

1. Check tồn tại:
   - `AGENTS.md`
   - `.agents/index.md`
   - `MEMORY.md` (private — chỉ hint, không upload)
2. Nếu có `.agents/index.md` → **Harness mode ON**.
3. Session env/cwd trỏ đúng project để Grok bootstrap rules local.

### 9.2 Hành vi mong muốn của agent (qua rules project)

Không hardcode hết trong app; app **nhắc và tạo điều kiện**:

| Bước harness | App hỗ trợ thế nào |
|--------------|--------------------|
| Orient | Đảm bảo `cwd` đúng; hiện file rules detected |
| Execute | Chat + tools như bình thường |
| Verify | Panel gợi ý “đã verify chưa?”; hiện command user/agent chạy |
| Distill | Template note KEEP/DISCARD/UNCERTAIN (optional) |
| Record | Link mở `MEMORY.md` / runbooks folder (local only) |
| Reuse | Search UI trên `_index.json` |

### 9.3 Privacy

- App **không** commit git giúp user các file agent private.
- Không gửi nội dung `MEMORY.md` / `.agents/` lên server của app (app không có server riêng).
- Secret scan: optional gọi script project nếu có `.agents/scripts/secret-scan.ps1`.

---

## 10. Bảo mật & quyền

| Rủi ro | Biện pháp |
|--------|-----------|
| Agent chạy shell nguy hiểm | Permission UI; default deny high-risk |
| Lộ token auth | Không copy `auth.json` ra log UI; redact |
| Path traversal ngoài project | Bridge sandbox `cwd`; cảnh báo khi tool đụng path ngoài |
| Supply chain | Pin version Tauri/deps; code review |
| Auto-update độc hại | Ký bản release (phase sau) |

**Permission tiers gợi ý:**

- **Low:** read file trong project
- **Medium:** write/edit file trong project
- **High:** shell, network, git push, xóa, path ngoài project

---

## 11. Phụ thuộc môi trường

| Phụ thuộc | Bắt buộc? | Ghi chú |
|-----------|-----------|---------|
| Windows 10/11 | Có (phase 1) | macOS/Linux sau |
| `grok` CLI đã cài + login | Có | `%USERPROFILE%\.grok\bin\grok.exe` |
| Node.js (dev) | Có khi dev frontend | |
| Rust toolchain (dev Tauri) | Có khi build native | |
| Tài khoản xAI / X Premium+ hoặc API | Có | Theo gói Grok user |

---

## 12. Tiêu chí thành công

### MVP thành công khi

- [ ] Cài/dev-run app trên máy dev local.
- [ ] Mở được project bất kỳ, chat 1 task hoàn chỉnh.
- [ ] Thấy ít nhất read/edit/shell trên timeline.
- [ ] Approve được lệnh shell.
- [ ] Project `ban` (hoặc project harness) được nhận diện.

### Thành công dài hạn khi

- [ ] Dùng app thay terminal cho ≥50% task code hàng ngày.
- [ ] Harness checklist không bị quên sau task lớn.
- [ ] Update `grok` CLI không làm app chết hoàn toàn (bridge versioned).

---

## 13. Rủi ro & giả định

| Rủi ro | Mức | Giảm thiểu |
|--------|-----|------------|
| CLI chưa có stream JSON ổn định | Cao | Phase 0 PTY; theo dõi docs Grok |
| CLI đổi flag phá bridge | Trung bình | Adapter version; smoke test script |
| Kỳ vọng = Codex 100% quá sớm | Trung bình | Roadmap phase; MVP hẹp |
| Billing/usage API hạn chế | Thấp | Best-effort panel |
| Git root lạ (home directory làm git root) | Trung bình | Cảnh báo trong UI khi detect |

**Giả định:**

- User đã có Grok Build hoạt động trong terminal.
- Được phép spawn `grok` local như subprocess.
- Không cần server backend riêng cho v1.

---

## 14. So sánh hướng triển khai

| Hướng | Khi nào chọn |
|-------|----------------|
| **A. Tauri desktop (chính)** | Muốn app độc lập, brand riêng, harness UI |
| **B. VS Code extension** | Muốn nhanh, sống trong editor |
| **C. Chỉ PTY window** | Prototype 1 ngày, ít code |
| **D. Tự viết agent loop + API** | Tránh — mất skills/tools Grok Build |

**Quyết định mặc định của dự án:** **A**, bắt đầu bằng **C lồng trong A** (Phase 0).

---

## 15. Lộ trình file tài liệu cần có thêm

| File | Nội dung |
|------|----------|
| `README.md` | Clone, install Rust/Node, `npm run tauri dev` |
| `docs/architecture.md` | Sơ đồ chi tiết module |
| `docs/protocol.md` | Event schema versioned |
| `docs/harness-integration.md` | Mapping harness ↔ UI |
| `docs/decisions.md` | ADR (Tauri, PTY, permission model) |

---

## 16. Việc làm ngay (next actions)

1. **Chốt stack UI:** React hay Svelte (gợi ý: React nếu quen; Svelte nếu muốn bundle nhẹ).
2. **Scaffold Tauri** trong `D:\grok-buid-app`.
3. **Phase 0:** project picker + embed/spawn `grok` theo `cwd`.
4. **Đo protocol** headless/agent của `grok` trên máy (ghi vào `docs/protocol.md`).
5. **Gắn harness detect** đơn giản (badge).

---

## 17. Tóm tắt một trang

| Câu hỏi | Trả lời |
|---------|---------|
| **Là gì?** | Desktop app bọc Grok Build |
| **Để làm gì?** | Dùng Grok giống Codex: project, chat, tools, permission, harness |
| **Không làm gì?** | Không thay model; không viết agent từ đầu |
| **Làm thế nào?** | Tauri UI → Bridge → `grok` CLI |
| **Phase đầu?** | Cửa sổ + chọn folder + chạy Grok đúng project |
| **Thành công?** | Code hằng ngày trên app, harness không bị bỏ quên |

---

## 18. Liên kết liên quan

| Đường dẫn / URL | Vai trò |
|-----------------|---------|
| `%USERPROFILE%\.grok\` | Cài Grok CLI, auth, config (local, không commit) |
| https://github.com/ngt-baor/Grok-buid-app | Source + GitHub Releases (in-app update) |
| Project `AGENTS.md` / `.agents/` (per project) | Harness rules — **không** push harness cá nhân vào repo app |

---

*Tài liệu này là đặc tả dự án (product + engineering). Cập nhật khi chốt protocol thật từ CLI và sau mỗi phase hoàn thành.*
)
