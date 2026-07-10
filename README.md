# Grok Build App

Desktop shell for Grok Build (Electron + ACP).

- **Repo:** https://github.com/ngt-baor/Grok-buid-app
- **In-app updates:** GitHub Releases of this repo (`ngt-baor/Grok-buid-app`)

## Clone & run

```powershell
git clone https://github.com/ngt-baor/Grok-buid-app.git
cd Grok-buid-app
npm install
npm run dev
```

## Package (Windows)

```powershell
npm run dist:win
# output: release/*.exe
```

## Do not commit

- Personal harness: `AGENTS.md`, `.agents/`, `MEMORY.md`
- Secrets: `auth.json`, `.env*`
- Machine-local session paths

Full source is pushed from the local workspace after audit (`npm run release:push`).
