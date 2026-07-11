# Pre-push checklist (Grok Build App)

Repo đích: https://github.com/ngt-baor/Grok-buid-app

## Không được push

| Mục | Lý do |
|-----|--------|
| `AGENTS.md` / `Agents.md` / `.agents/` | Harness **cá nhân** — mỗi máy/người khác nhau |
| `MEMORY.md`, `Harness-Engineering.txt` | Memory / harness local |
| `auth.json`, `.env*`, secrets | Credential |
| Path `C:\Users\<you>\...`, session Grok | Thông tin máy local |
| `_diag_*.js` | Script chẩn đoán cá nhân |
| `node_modules/`, `dist/`, `release/` | Build artifact (release exe chỉ gắn GitHub **Release**, không bắt buộc trong git) |

`.gitignore` đã chặn các mục trên.

## Được push

- Source: `electron/`, `src/`, `public/`, `assets/` (icon/logo brand của app)
- `package.json` (repo + `grokBuild.updateRepo = ngt-baor/Grok-buid-app`)
- Docs công khai: `README.md`, `PROJECT.md`, `docs/*`
- Project skills: `skills/*` (playbook Grok công khai — **không** nhầm với `.agents/` harness cá nhân)

## Cập nhật in-app

Luôn resolve về **`ngt-baor/Grok-buid-app`** (settings default → package.json → hard fallback).

Cần GitHub Release có tag semver (`v0.1.0`) + asset `.exe` thì nút “Kiểm tra cập nhật” mới tải được installer.

## Lệnh một phát (máy local)

```powershell
cd D:\grok-buid-app

# (tuỳ chọn) import icon PNG bạn gửi
powershell -ExecutionPolicy Bypass -File .\scripts\import-brand-icon.ps1 -Source "path\to\logo.png"

# pack + audit + push
npm run release:push
```

Hoặc tách bước:

```powershell
npm install
npm run dist:win          # → release\*.exe
git add -A
git status                # xem lại: KHÔNG có AGENTS.md / .agents / auth
git commit -m "Release: public update repo, icon, packaging"
git remote add origin https://github.com/ngt-baor/Grok-buid-app.git  # nếu chưa có
git push -u origin main
```

Sau push: GitHub → Releases → New release → đính kèm file trong `release\`.
