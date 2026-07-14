# Grok Build

Desktop shell (Electron) cho **Grok CLI** — chat/agent theo project, UI gần Codex, runtime vẫn là Grok local.

- **Repo:** https://github.com/ngt-baor/Grok-buid-app  
- **Update in-app:** GitHub Releases (`ngt-baor/Grok-buid-app`)  
- **Version:** `0.1.3`

## Chạy

```powershell
git clone https://github.com/ngt-baor/Grok-buid-app.git
cd Grok-buid-app
npm install
npm run dev          # dev (Vite + Electron)
# hoặc
npm run build
npm run start        # production UI
```

Đóng gói Windows:

```powershell
npm run dist:win     # → release/*.exe (Setup + Portable)
```

### Yêu cầu runtime

| Cần | Ghi chú |
|-----|---------|
| **Grok CLI** | `~\.grok\bin\grok.exe` — cài **trong app** (progress giống update) hoặc tự cài |
| **Đăng nhập xAI** | OIDC **device-code trong app** (mở web + nhập mã). Terminal/`grok login` chỉ còn fallback |
| Token | `~\.grok\auth.json` trên máy đang chạy — **không** nhúng trong `.exe` |

## Tính năng chính

| Nhóm | Chi tiết |
|------|----------|
| **Chat / agent** | ACP qua Grok CLI · stream · tool cards · stop · multi-tab theo project |
| **Project** | Mở folder · recent · draft theo tab · single-flight (đổi tab/project khi agent chạy → turn cũ chạy hết, không spill) |
| **Model** | List model live · reasoning effort high/medium/low |
| **Git** | Branch, dirty, ahead/behind, status, worktrees |
| **Files / Diff** | Cây file + preview · diff khi agent ghi file |
| **Auth / CLI** | Login device-code in-app · cài/cập nhật CLI in-app · refresh token |
| **Settings** | Theme · **UI vi/en** · always-approve · terminal ngoài · Chrome DevTools MCP (opt-in) · personalization |
| **Harness** | Detect AGENTS/MEMORY · domains/runbooks · post-task checklist · privacy banner |
| **Usage** | SuperGrok tuần (`?format=credits`) + Credits billing + token log — **tuần ≠ credits ≠ tokens** |
| **Update** | Kiểm tra / tải từ GitHub Releases |

## Phím tắt

| Phím | Việc |
|------|------|
| `Ctrl+K` | Command palette |
| `Ctrl+B` / `Ctrl+Alt+B` / `Ctrl+J` | Sidebar trái / panel phải / panel dưới |
| `Ctrl+O` / `Ctrl+N` / `Ctrl+,` | Mở folder / tab mới / Settings |
| `Ctrl+\`` | Terminal ngoài (cwd = project) |
| `Enter` / `Shift+Enter` | Gửi / xuống dòng |

## Data local

| Path | Nội dung |
|------|----------|
| `%APPDATA%\grok-build-app\settings.json` | Settings app |
| `%APPDATA%\grok-build-app\project-sessions\` | Chat / tab theo project |
| `~\.grok\auth.json` | OIDC token (dùng chung với CLI) |
| `~\.grok\bin\grok.exe` | Grok CLI |

## Cấu trúc (tóm tắt)

```
electron/   main, preload, acp-bridge, auth, cli-install, sessions, git, …
src/        App.tsx, i18n.ts, styles
docs/       bug notes
```

## Ghi chú

- **SuperGrok tuần** = pool dùng chung (web Settings → Usage). **Credits** = kỳ billing Build. **Token** = inference từ `~\.grok\logs\`
- Grok Desktop (app xAI) có thể phình IndexedDB: `npm run fix:idb-bloat` hoặc palette → Clean IndexedDB — [docs/BUG-IndexedDB-WAL-balloon.md](./docs/BUG-IndexedDB-WAL-balloon.md).
