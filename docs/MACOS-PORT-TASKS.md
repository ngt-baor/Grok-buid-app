# macOS port — Task list

**Repo:** `ngt-baor/Grok-buid-app`  
**Working copy:** `~/Developer/Grok-buid-app`  
**Mục tiêu:** Cùng codebase / cùng version / cùng GitHub Release với Windows.  
**Branch gợi ý:** `feature/macos-support`

**Nguyên tắc**

- Không tạo project/folder app Mac riêng.
- UI (`src/`) giữ chung; platform code nằm ở `electron/` (và optional `electron/platform/`).
- Mỗi version tag `vX.Y.Z` ship **cả** asset Win + Mac khi đủ sẵn sàng.
- Checklist: `[ ]` todo · `[x]` done · `[-]` skipped/N/A

---

## Phase 0 — Setup môi trường

- [x] **T0.1** Mở project: `~/Developer/Grok-buid-app`
- [x] **T0.2** Tạo branch: `git checkout -b feature/macos-support`
- [x] **T0.3** Cài Node.js LTS (nếu chưa có): `node -v` ≥ 18
- [x] **T0.4** `npm install` trong root project
- [x] **T0.5** Xác nhận Grok CLI Mac: `~/.grok/bin/grok --version` (hoặc `which grok`)
- [x] **T0.6** `npm run dev` — Electron window mở, không crash ngay
- [-] **T0.7** (Optional) Cài VS Code extensions: Prettier, Error Lens, Path Intellisense, GitLens

**Done when:** App dev chạy trên Mac; CLI Grok có sẵn trên máy.

---

## Phase 1 — Path & resolve binary Grok

- [x] **T1.1** Default path: `~/.grok/bin/grok` trên Darwin (không hardcode `grok.exe`)
  - Files: `electron/settings.cjs`, `electron/cli-install.cjs`, `electron/auth.cjs`
- [x] **T1.2** Candidate list: `settings.grokPath` → `~/.grok/bin/grok` → `~/.grok/bin/grok.exe` (legacy) → bare `grok`
- [x] **T1.3** Resolve PATH trên Mac: `which` / `command -v` (không dùng `where.exe`)
- [x] **T1.4** `getCliStatus().supported` / `platformTriple()`:
  - `macos-aarch64` khi `darwin` + `arm64`
  - `macos-x86_64` khi `darwin` + `x64`
- [x] **T1.5** UI Settings: hiện path đã resolve + trạng thái installed OK trên Mac
- [x] **T1.6** ACP bridge spawn đúng binary Mac (`AcpBridge` + `grokPath` từ settings)

**Done when:** Open project → chat 1 prompt → stream + tools chạy với `~/.grok/bin/grok`.

---

## Phase 2 — Auth / login trên Mac

- [x] **T2.1** Device-code / in-app login: verify flow trên Darwin
- [x] **T2.2** Fallback CLI login: Terminal.app (`osascript`) đã có — test end-to-end
- [x] **T2.3** Đọc/ghi `~/.grok/auth.json` không lỗi permission
- [x] **T2.4** UI “đã login / chưa login” đúng sau refresh

**Done when:** Login xAI trên Mac ổn định; session agent authenticated.

---

## Phase 3 — Terminal ngoài & shell helpers

- [x] **T3.1** Thay/nhánh terminal launcher (hiện chỉ `wt` / PowerShell / cmd)
  - File: `electron/main.cjs` (và tách `electron/platform/terminal.cjs` nếu refactor)
- [x] **T3.2** Darwin options:
  - `auto` → Terminal.app
  - optional iTerm2 nếu cài
  - mở đúng `cwd` project
- [x] **T3.3** Settings UI: label terminal phù hợp Mac (không hiện “Windows Terminal” as only choice)
- [x] **T3.4** Hotkey `Ctrl+\`` / `Cmd+\`` mở terminal đúng cwd

**Done when:** Mở terminal ngoài từ app tại project path trên Mac.

---

## Phase 4 — CLI install / update trong app (Mac)

- [x] **T4.1** `platformTriple()` không return `null` trên Darwin
- [x] **T4.2** Download artifact Mac (align với xAI install script / channel hiện dùng)
- [x] **T4.3** Cài vào `~/.grok/bin/grok` (+ `agent` symlink nếu CLI yêu cầu)
- [x] **T4.4** Không gọi `powershell.exe` / `where.exe` trên Darwin
- [x] **T4.5** UI Install/Update CLI: progress + error message rõ trên Mac
- [x] **T4.6** Fallback: hiện lệnh `curl -fsSL https://x.ai/cli/install.sh | bash` nếu in-app fail

**Done when:** Máy chưa có CLI (hoặc update) cài được từ UI, hoặc fallback copy-paste rõ ràng.

---

## Phase 5 — Hardening platform (parity Win)

- [x] **T5.1** Rà toàn bộ `electron/*.cjs` cho `win32`-only / `.exe` / `powershell` / `APPDATA` hardcode
- [x] **T5.2** Git panel / worktree / reveal in Finder (`shell.showItemInFolder`) OK
- [x] **T5.3** File tree + diff + permission gate OK trên path Unix
- [x] **T5.4** Skills load từ `process.resourcesPath` + project skills OK khi packaged
- [-] **T5.5** Chrome DevTools MCP opt-in: smoke trên Mac (nếu bật)
- [x] **T5.6** userData: `~/Library/Application Support/grok-build-app` (Electron default) — không đụng profile app khác
- [x] **T5.7** Menu / accelerators: Cmd trên Darwin (đã partial trong `menu.cjs` — verify)
- [x] **T5.8** (Optional) Refactor `electron/platform/{paths,terminal,cli}.cjs` để tránh rải `if (platform)`

**Done when:** Daily workflow trên Mac ≈ Windows (trừ installer).

---

## Phase 6 — Packaging macOS

- [x] **T6.1** Thêm `build.mac` trong `package.json` (dmg + zip, arch `arm64` ± `x64`)
- [x] **T6.2** Script `npm run dist:mac`
- [x] **T6.3** Icon `assets/icon.icns` (generate từ logo hiện có)
- [x] **T6.4** `productName` / `appId` / category: Developer Tools
- [x] **T6.5** `extraResources` skills giữ nguyên
- [x] **T6.6** Build local: `npm run dist:mac` → ra file trong `release/`
- [x] **T6.7** Mở `.app` / `.dmg` unsigned — smoke launch + chat

**Done when:** Có artifact Mac local chạy được (có thể cần right-click Open nếu chưa sign).

---

## Phase 7 — Updater đồng bộ Win + Mac

- [x] **T7.1** Giữ **1** GitHub repo + **1** tag version cho cả 2 OS
- [x] **T7.2** Verify `pickDownloadAsset`: Darwin → `.dmg` ưu tiên, rồi `.zip` (đã có skeleton)
- [x] **T7.3** Ưu tiên arch: `arm64` vs `x64` trong tên asset
- [x] **T7.4** Message khi release có version mới nhưng **thiếu** asset Mac
- [x] **T7.5** `applyUpdate` trên Mac: open `.dmg` / reveal in Finder
- [x] **T7.6** Error strings: không chỉ nói “cần .exe”
- [x] **T7.7** Cập nhật skill `skills/github-release-updater` (Win + Mac assets)
- [x] **T7.8** Quy ước tên file release:

  | Asset | Platform |
  |-------|----------|
  | `Grok-Build-Setup-${version}.exe` | Windows |
  | `Grok-Build-Portable-${version}.exe` | Windows |
  | `Grok-Build-${version}-arm64.dmg` | Mac Apple Silicon |
  | `Grok-Build-${version}-x64.dmg` | Mac Intel (nếu ship) |
  | `Grok-Build-${version}-arm64-mac.zip` | Mac (optional update) |
  | `latest.yml` / `latest-mac.yml` | electron-builder metadata |

**Done when:** App Mac bản cũ thấy update → tải đúng `.dmg` → mở cài được.

---

## Phase 8 — Release process & checklist

- [x] **T8.1** Sửa `scripts/release-checklist.cjs`: require **cả** Win + Mac files (hoặc mode `--platform=mac|win|all`)
- [x] **T8.2** Document trong `README.md`: Requirements Mac + `npm run dist:mac`
- [x] **T8.3** Cập nhật `PROJECT.md` status: macOS supported (dev / packaged)
- [x] **T8.4** Quy trình bump version **một lần** → build Win + Mac → **một** GitHub Release
- [x] **T8.5** (Optional) GitHub Actions matrix:
  - `windows-latest` → `dist:win`
  - `macos-latest` → `dist:mac`
  - job `release` upload chung 1 tag
- [x] **T8.6** Không tạo tag `vX.Y.Z-mac` riêng

**Done when:** Checklist + README phản ánh dual-platform; release `vX.Y.Z` có đủ assets.

---

## Phase 9 — Code signing & notarize (phân phối công khai)

- [ ] **T9.1** ⏳ *cần Apple Developer account của bạn* Apple Developer account
- [ ] **T9.2** Developer ID Application certificate
- [x] **T9.3** electron-builder `identity` + hardened runtime
- [ ] **T9.4** Notarize (notarytool) + staple
- [ ] **T9.5** User tải DMG → Gatekeeper OK (không cần bypass)

**Done when:** User Mac khác cài được không cảnh báo chặn (hoặc chỉ warning chuẩn Apple).

*Có thể ship internal/unsigned trước; Phase 9 không chặn Phase 1–7.*

---

## Phase 10 — QA / smoke

- [x] **T10.1** Open project + multi-tab chat
- [ ] **T10.2** Permission allow/deny
- [ ] **T10.3** Diff sau khi agent edit file
- [ ] **T10.4** Git branch chip / worktree
- [ ] **T10.5** Queue + stop generation
- [ ] **T10.6** Usage / profile panel (best-effort)
- [ ] **T10.7** Skills library list
- [x] **T10.8** Update check (mock release hoặc pre-release)
- [x] **T10.9** `npm run smoke:ui` adapt cho Mac (nếu script đang Win-only)
- [ ] **T10.10** Regression nhanh trên Windows sau merge (không phá Win paths)

**Done when:** Checklist QA pass trên Mac arm64; Win vẫn build/chạy.

---

## Phase 11 — Merge & ship

- [ ] **T11.1** PR `feature/macos-support` → `main` (description: dual-platform + updater)
- [ ] **T11.2** Review: không hardcode path Windows trong default Darwin
- [ ] **T11.3** Merge
- [ ] **T11.4** Bump version (vd. `0.1.9` hoặc `0.2.0` nếu Mac là milestone)
- [ ] **T11.5** Build Win + Mac → GitHub Release `vX.Y.Z` đủ assets
- [ ] **T11.6** Release notes: “Windows + macOS”
- [ ] **T11.7** Xóa / archive branch feature sau merge

**Done when:** Public release hỗ trợ cả 2 OS, cùng version.

---

## Thứ tự làm (gợi ý sprint)

| Sprint | Phases | Mục tiêu user-facing |
|--------|--------|----------------------|
| **S1** | 0 → 1 → 2 | Dev Mac: chat + login |
| **S2** | 3 → 4 → 5 | Parity daily use |
| **S3** | 6 → 7 → 10 | DMG + in-app update |
| **S4** | 8 → 11 | Process + ship |
| **S5** | 9 | Sign/notarize (khi phân phối rộng) |

---

## Out of scope (cố ý không làm trong port Mac)

- [ ] Viết lại agent / thay Grok CLI
- [ ] Repo riêng `Grok-buid-app-mac`
- [ ] Version number khác nhau giữa Win và Mac
- [ ] Clone 100% Codex browser panel / PTY embed (vẫn deferred như Win)
- [ ] Linux production (có thể later; updater đã có skeleton)

---

## Ghi chú kỹ thuật nhanh

| Hạng mục | Windows | macOS |
|----------|---------|--------|
| CLI binary | `~/.grok/bin/grok.exe` | `~/.grok/bin/grok` |
| Auth | `~/.grok/auth.json` | giống |
| App settings | `%APPDATA%\grok-build-app` | `~/Library/Application Support/grok-build-app` |
| Terminal | wt / PowerShell / cmd | Terminal.app / iTerm |
| Installer | NSIS `.exe` | `.dmg` / `.zip` |
| Update pick | Setup `.exe` | `.dmg` (code đã partial) |

---

## Progress log

| Date | Note |
|------|------|
| 2026-07-20 | Task list created; repo cloned at `~/Developer/Grok-buid-app` |
| 2026-07-20 | **Phase 0 complete** — branch, Node, npm, Electron, Grok CLI |
| 2026-07-20 | **Phase 1 complete** — platform paths, CLI status, ACP handshake on Mac |
| 2026-07-20 | **Phase 2–6 complete** — auth, terminal, CLI install paths, hardening, dist:mac DMG |
| 2026-07-20 | **Phase 7 complete** — update_no_asset, apply dmg, skill, pick arch |
| 2026-07-20 | **Phase 8 complete** — README dual-platform, CI release.yml, checklist win/mac |
| 2026-07-20 | **Phase 10 partial** — smoke:platform; full UI QA pending |
| 2026-07-20 | **Phase 9 infra ready** — entitlements, afterSign, MACOS-SIGNING.md; ad-hoc sign; no Developer ID yet |
| 2026-07-20 | **Phase 10 auto QA** — smoke+ACP+auth; app opened via npm run dev for user test |

*Cập nhật checkbox khi hoàn thành từng task.*
