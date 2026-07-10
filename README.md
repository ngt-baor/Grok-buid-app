# Grok Build App

Desktop shell cho Grok Build (Electron + ACP).

## Repo & cập nhật

- Source: https://github.com/ngt-baor/Grok-buid-app
- In-app update luôn trỏ GitHub Releases của repo trên (`ngt-baor/Grok-buid-app`).
- **Không** commit harness cá nhân (`AGENTS.md`, `.agents/`, `MEMORY.md`), `auth.json`, hay path máy local.

## Chạy

```powershell
git clone https://github.com/ngt-baor/Grok-buid-app.git
cd Grok-buid-app
npm install
npm run dev          # dev
# hoặc
npm run build
npm run start        # production
```

### Đóng gói Windows

```powershell
npm install
npm run dist:win     # → release/*.exe (NSIS + portable)
```

Cần `grok login` và `%USERPROFILE%\.grok\bin\grok.exe`.

## UI kiểu Codex (shell Grok)

Visual bám desktop ChatGPT Codex: nền trung tính `#212121`, sidebar tối, empty-state 4 card, composer bo tròn nổi, chip project · Cục bộ · branch, titlebar overlay (ẩn menu Tệp/Chỉnh sửa), nút gửi monochrome. Runtime vẫn là **Grok CLI** — xem map đầy đủ:

→ [docs/CODEX-FEATURE-MAP.md](./docs/CODEX-FEATURE-MAP.md) (làm được / làm một phần / không làm giống).

## Tính năng

| Tính năng | Mô tả |
|-----------|--------|
| **Empty cards** | 4 starter: khám phá · build · review · fix |
| **Model picker** | Live list từ `cli-chat-proxy /v1/models` |
| **Reasoning effort** | high / medium / low → `--reasoning-effort` |
| **Chat per project** | Mỗi folder transcript riêng |
| **Multi-tab** | Session con dưới project (sidebar) + lịch sử |
| **Git chip + panel** | Branch, dirty, ahead/behind, status, worktrees |
| **File tree + preview** | Panel phải · mở file · reveal Explorer |
| **Diff viewer** | Khi agent `fs/write` qua ACP |
| **Command palette** | `Ctrl+K` |
| **Toggle sidebar trái** | `Ctrl+B` |
| **Toggle panel phải** | `Ctrl+Alt+B` |
| **Toggle panel dưới** | `Ctrl+J` |
| **Draft prompt** | Lưu theo tab khi đổi chat/project |
| **Tool cards** | Gộp update + collapse (click mở chi tiết) |
| **Open folder** | `Ctrl+O` |
| **New tab** | `Ctrl+N` |
| **Settings** | `Ctrl+,` · theme · terminal · checklist · Chrome DevTools MCP |
| **Chrome DevTools MCP** | Opt-in: inject `chrome-devtools-mcp` vào ACP `session/new` (agent browser/debug) |
| **Terminal ngoài** | `Ctrl+\`` · Windows Terminal / PowerShell / cmd |
| **Permission gate** | Allow once / Always (session) / Deny |
| **Harness panel** | Domains, runbooks search, AGENTS/MEMORY, privacy |
| **Post-task checklist** | Sau turn có tool (Verify / Record / Privacy) |
| **Context badge** | Session prompt tokens / context window |
| **Usage modal** | Credits API + token log 5h/7d |

## Usage — đồng bộ dữ liệu thật

| Thanh | Nguồn | Ý nghĩa |
|-------|--------|---------|
| **Credits · kỳ billing** | API `GET https://cli-chat-proxy.grok.com/v1/billing` | Credit còn / limit (vd. 19814/20000) — **quota chính thức** |
| **Token 5 giờ** | `~/.grok/logs/unified.jsonl` → `shell.turn.inference_done` | Tổng **prompt+completion tokens thật** 5h qua |
| **Token 7 ngày** | Cùng log, cửa sổ 7 ngày | Token inference thật 7 ngày |

### Lưu ý quan trọng

1. **Credits ≠ tokens.** Grok Build billing tính bằng **credit units**. Token 5h/7d là **số token inference** từ log CLI (mọi session Grok trên máy).
2. Grok **không public** rate-limit “% remaining 5h” kiểu Codex. Vì vậy thanh 5h/7d hiển thị **đã dùng thật**, không bịa “còn X%”.
3. App **tự refresh OIDC token** khi hết hạn (ghi lại `auth.json`).
4. Poll usage mỗi ~45s + nút Refresh.

## Phím tắt

- `Ctrl+K` — Command palette
- `Ctrl+B` — Ẩn/hiện **sidebar trái**
- `Ctrl+Alt+B` — Ẩn/hiện **panel phải** (Files/Diff/Git)
- `Ctrl+J` — Ẩn/hiện **panel dưới** (activity / terminal ngoài)
- `Ctrl+O` — Mở folder
- `Ctrl+N` — Tab chat mới
- `Ctrl+,` — Cài đặt
- `Ctrl+\`` — Terminal ngoài (cwd = project)
- `Enter` — Gửi · `Shift+Enter` — xuống dòng

### UX notes (2026-07)

- **Single-flight background:** đổi tab khi agent chạy → tab cũ **vẫn chạy đến xong**; message chỉ ghi vào tab owner, **không spill**. Tab khác: soạn draft được, **không gửi** cho đến khi xong hoặc Dừng (banner “Quay lại tab”).
- Đổi **project** khi agent chạy → turn **vẫn chạy đến xong** trên project owner; project khác hiện banner “Quay lại project” + tag **chạy** trên sidebar; **không gửi / không Start** cho đến khi xong hoặc Dừng.
- Đóng **tab owner** đang chạy → cancel (có confirm). Gỡ project owner khỏi recent → cancel.
- Draft composer **persist** theo tab.
- Gỡ project khỏi recent → **confirm**.
- Ghim tóm tắt (📍) giữ panel phải + card môi trường.
- Scrollbar custom (ẩn chrome Windows mặc định).

## Cấu trúc

```
electron/
  main.cjs preload.cjs acp-bridge.cjs
  auth.cjs usage.cjs sessions.cjs files.cjs
  settings.cjs harness.cjs git.cjs storage-hygiene.cjs
src/App.tsx styles.css vite-env.d.ts
docs/CODEX-FEATURE-MAP.md
PROJECT.md
```

## Data local

- Settings: `%APPDATA%\grok-build-app\settings.json`
- Chats/tabs: `%APPDATA%\grok-build-app\project-sessions\`

## IndexedDB / LevelDB WAL bloat (Grok Desktop)

Official Grok Desktop can grow `%APPDATA%\grok\IndexedDB\https_x.com_0.indexeddb.leveldb` to tens of GB.

```powershell
npm run fix:idb-bloat              # kill grok.exe + delete IDB + restart
npm run fix:idb-bloat:clean-only   # kill + delete only
```

In-app: `Ctrl+K` → **Clean IndexedDB bloat**. See [docs/BUG-IndexedDB-WAL-balloon.md](./docs/BUG-IndexedDB-WAL-balloon.md).
