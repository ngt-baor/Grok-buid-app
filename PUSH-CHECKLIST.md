# Pre-push checklist (Grok Build App)

Repo đích: https://github.com/ngt-baor/Grok-buid-app

## Không được push

| Mục | Lý do |
|-----|--------|
| `AGENTS.md` / `Agents.md` / `.agents/` | Harness **cá nhân** — mỗi máy/người khác nhau |
| `MEMORY.md`, `Harness-Engineering.txt` | Memory / harness local |
| `auth.json`, `.env*`, secrets | Credential |
| Path `C:\\Users\\<you>\\...`, session Grok | Thông tin máy local |
| `_diag_*.js` | Script chẩn đoán cá nhân |
| `node_modules/`, `dist/`, `release/` | Build artifact |

`.gitignore` đã chặn các mục trên.

## Cập nhật in-app

Luôn resolve về **`ngt-baor/Grok-buid-app`**.

## Lệnh một phát

```powershell
cd D:\\grok-buid-app
npm run release:push
# hoặc double-click PUSH.bat
```
