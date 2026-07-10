# Codex UI → Grok Build App — Feature map

Phân tích từ screenshot ChatGPT Codex (desktop) so với **Grok Build App** (repo này).

---

## 1. Layout Codex trên ảnh

| Vùng | Nội dung screenshot |
|------|---------------------|
| **Sidebar trái** | Brand, Tác vụ mới, Đã lên lịch, Plugin, Trang web, Trò chuyện · **Dự án** (Vizi, EzBook, C:, …) · session con dưới project |
| **Empty state** | “Chúng ta nên xây dựng gì trong {Project}?” + 4 thẻ: Khám phá code · Xây tính năng · Rà soát · Sửa lỗi |
| **Composer** | Chip: project · Cục bộ · branch · ô “Làm bất cứ điều gì” · model (vd. 5.6 Sol Cao) · + · Tùy chỉnh |
| **Rail / palette** | Đánh giá · Giao diện dòng lệnh · Trình duyệt · Tệp |
| **Usage** | Giới hạn 5 giờ % · Giới hạn tuần % · Reset còn N lượt · Nâng cấp / Thêm credit |
| **Settings** | Cá nhân / Tích hợp / Lập trình · Quyền mặc định · Rà soát tự động · Toàn quyền · Terminal · Ngôn ngữ |

---

## 2. Có thể làm giống (UI + hành vi)

| # | Tính năng Codex | Cách làm trong app này | Status |
|---|-----------------|------------------------|--------|
| 1 | Sidebar dark + brand | CSS + logo “Grok Build” | ✅ UI |
| 2 | Tác vụ mới / New chat | `createTab` + clear empty state | ✅ |
| 3 | Lịch sử session theo project | Tabs + recent projects + persist `%APPDATA%` | ✅ |
| 4 | Danh sách dự án (mở folder) | Open Folder + recent list | ✅ |
| 5 | Session con dưới project | Multi-tab trong project | ✅ |
| 6 | Empty state + 4 action cards | Prompt starter → composer / auto-send | ✅ UI |
| 7 | Composer + placeholder | Textarea + attach + Enter | ✅ |
| 8 | Chip project · local · branch | Project name + “Local”; branch + dirty/ahead/behind | ✅ |
| 9 | Model picker | List models CLI + select | ✅ |
| 10 | Reasoning / effort | `--reasoning-effort` high/med/low | ✅ (≠ Codex “Sol”) |
| 11 | Stream chat + tool timeline | ACP `session/update` | ✅ |
| 12 | Permission approve/deny | Modal Allow once / Always session / Deny | ✅ |
| 13 | Quyền: mặc định / always approve | Settings + session allow-always | ✅ |
| 14 | File tree + mở file | Right panel Files / Preview / Explorer | ✅ |
| 15 | Diff khi agent ghi file | Diff panel từ ACP write | ✅ |
| 16 | Command palette | `Ctrl+K` (+ terminal, harness, git…) | ✅ |
| 17 | Usage panel | Credits API + token log 5h/7d | ⚠️ khác metric |
| 18 | Settings modal | Hồ sơ · Cá nhân hóa · Chung / Quyền / Agent | ✅ |
| 18b | Profile (Hồ sơ) | Token lifetime/peak, streak, heatmap, skills | ✅ |
| 18c | Personalization | Personality · custom instructions · memory | ✅ |
| 19 | Auth status | `auth.json` / refresh | ✅ |
| 20 | Harness badge + panel | Detect, domains, runbooks, checklist, privacy | ✅ (Codex không có) |
| 21 | Đính kèm ảnh/file | Clipboard, drag-drop, dialog | ✅ |
| 22 | Stop generation | Cancel turn | ✅ |
| 23 | Terminal ngoài | `Ctrl+\`` · WT / PowerShell / cmd (không PTY embed) | ✅ partial |
| 24 | Git worktrees + status | Panel Git · open worktree as project | ✅ |
| 25 | Post-task checklist | Harness verify/record/privacy after tools | ✅ |
| 26 | Phím tắt | Ctrl+K/B/O/N/`,`/` | ✅ |

---

## 3. Làm được một phần (gần giống, khác engine)

| # | Codex | Giới hạn khi clone bằng Grok |
|---|-------|------------------------------|
| A | **Plugin ecosystem** | Grok có skills/tools riêng — không tương thích plugin ChatGPT |
| B | **Trang web / browser tool** | Opt-in **Chrome DevTools MCP** (`session/new` inject) — agent điều khiển Chrome (screenshot, console, network). **Không** embed browser panel UI như Codex `Ctrl+T` |
| C | **Giao diện dòng lệnh** | **Terminal ngoài** đã có; PTY embed trong panel = chưa (cần node-pty + xterm) |
| D | **Usage 5h / tuần % còn lại** | Codex: quota official %. Grok: credits billing + token từ log — **không có** cùng API “còn 99% 5h” |
| E | **Reset limit / mua credit trong app** | Cần portal xAI / OpenAI — app chỉ `openExternal` x.ai, không checkout |
| F | **Đánh giá (Evaluate)** | Map “review code” starter prompt — không product Evaluate riêng |
| G | **Worktree UI** | List + open worktree as project — **đã có**; create/remove worktree UI chưa |
| H | **Rà soát tự động / Toàn quyền** | alwaysApprove + session allow-always — không policy engine full Codex |
| I | **Ngôn ngữ UI** | UI đang tiếng Việt + một phần EN; full i18n toggle chưa |
| J | **Voice** | Ngoài scope MVP |

---

## 4. Không thể / không nên làm giống 100%

| # | Tính năng | Lý do |
|---|-----------|--------|
| 1 | Model **GPT Codex / 5.6 Sol** | Model OpenAI — app dùng **Grok** (`grok-4.5` …) |
| 2 | Backend agent OpenAI + cloud sandbox Codex | Runtime = local `grok` CLI + xAI |
| 3 | Plugin store ChatGPT | Khác platform, license, API |
| 4 | Billing OpenAI (nâng cấp gói ChatGPT) | Khác vendor |
| 5 | Quota reset “Còn 2 lượt” official | API Grok không expose y hệt |
| 6 | Đăng nhập / profile ChatGPT | Auth OIDC Grok / xAI |
| 7 | “Trò chuyện” = ChatGPT chat product | App này là **coding agent shell**, không full ChatGPT |
| 8 | Computer-use / full desktop control của OpenAI | Phụ thuộc tool Grok; không clone UI “Computer use” OpenAI |
| 9 | Cloud project sync multi-device OpenAI | Session local only |
| 10 | Reverse-engineer binary Codex private | Tránh — build shell quanh Grok chính thức |

---

## 5. Mapping starter prompts (empty cards)

| Card Codex (VI) | Prompt gửi agent (gợi ý) |
|-----------------|---------------------------|
| Khám phá và hiểu code | `Hãy khám phá cấu trúc project, stack, entry points và tóm tắt kiến trúc chính.` |
| Xây dựng tính năng… | `Hãy đề xuất và triển khai một tính năng mới hữu ích cho project này. Bắt đầu bằng orient ngắn.` |
| Rà soát code… | `Rà soát code quan trọng, chỉ ra rủi ro/bug/smell và đề xuất thay đổi cụ thể (kèm file).` |
| Sửa sự cố và lỗi | `Tìm lỗi / failing tests / log gần đây và sửa. Verify sau khi sửa.` |

---

## 6. Ưu tiên implement UI giống Codex

1. **P0** — Sidebar nav + projects + empty cards + composer chips — ✅
2. **P0** — Usage modal kiểu progress bar (data Grok thật) — ✅
3. **P1** — Settings categories (Hồ sơ / Cá nhân hóa / Chung / Quyền / Agent) — ✅
4. **P1** — Git branch chip + dirty/upstream — ✅
5. **P2** — External terminal (thay PTY embed) — ✅ partial
6. **P2** — Worktree panel — ✅
7. **P2** — Harness runbooks / checklist / privacy — ✅
8. **Không làm** — Clone branding ChatGPT, plugin store OpenAI, billing OpenAI, PTY full (tùy chọn sau)

---

*Cập nhật 2026-07-10: ship bulk remaining doable features.*
