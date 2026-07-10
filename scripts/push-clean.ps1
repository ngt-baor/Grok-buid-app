# Clean audit + package + push to https://github.com/ngt-baor/Grok-buid-app.git
# Run from repo root:  powershell -ExecutionPolicy Bypass -File .\scripts\push-clean.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== Pre-push audit (personal / harness / secrets) ==" -ForegroundColor Cyan

$blockedPatterns = @(
  'AGENTS.md',
  'Agents.md',
  'MEMORY.md',
  'Harness-Engineering.txt',
  '.agents/',
  'auth.json',
  '_diag_',
  'scripts/_',
  '.grok/sessions',
  'prompt_context.json',
  'chat_history.jsonl',
  'system_prompt.txt'
)

# Ensure gitignore is loaded
if (-not (Test-Path .git)) {
  git init
  git branch -M main
}

$remote = "https://github.com/ngt-baor/Grok-buid-app.git"
$existing = git remote get-url origin 2>$null
if (-not $existing) {
  git remote add origin $remote
} elseif ($existing -ne $remote) {
  Write-Host "Updating origin: $existing -> $remote"
  git remote set-url origin $remote
}

# Generate icon.png if possible (Windows-safe: electron script file, not -e)
Write-Host "== Icon PNG ==" -ForegroundColor Cyan
try {
  npm run icon:png
  if ($LASTEXITCODE -ne 0) { throw "icon:png exit $LASTEXITCODE" }
} catch {
  Write-Warning "Could not generate icon.png via Electron: $_"
  try {
    node ./scripts/generate-icon-png.mjs
  } catch {
    Write-Warning "Fallback generate-icon-png.mjs also failed: $_"
  }
}

Write-Host "== Install + build + pack ==" -ForegroundColor Cyan
npm install
npm run dist:win

Write-Host "== Stage safe files only ==" -ForegroundColor Cyan
git add -A

# Unstage anything that looks personal even if force-added
$staged = git diff --cached --name-only
foreach ($f in $staged) {
  foreach ($p in $blockedPatterns) {
    if ($f -like "*$p*" -or $f -eq $p) {
      Write-Host "UNSTAGE blocked: $f" -ForegroundColor Yellow
      git reset HEAD -- "$f" 2>$null
    }
  }
}

# Double-check content for local user paths in staged text files
$staged2 = git diff --cached --name-only
foreach ($f in $staged2) {
  if ($f -match '\.(png|jpg|jpeg|gif|ico|woff2?|exe|dll)$') { continue }
  try {
    $text = Get-Content -LiteralPath $f -Raw -ErrorAction SilentlyContinue
    if ($null -eq $text) { continue }
    # Personal machine paths or AI session dumps must not ship
    $hasSessionPath =
      ($text -match 'C:[\\/]Users[\\/][^\\/\s]+[\\/]\.grok[\\/]sessions') -or
      ($text -match '\.grok[\\/]sessions[\\/]')
    if ($hasSessionPath) {
      Write-Host "UNSTAGE personal path content: $f" -ForegroundColor Red
      git reset HEAD -- "$f" 2>$null
    }
  } catch {}
}

Write-Host "== Staged files ==" -ForegroundColor Cyan
git diff --cached --name-only

$status = git status --porcelain
if (-not $status) {
  Write-Host "Nothing to commit."
} else {
  git commit -m "Release: update source ngt-baor/Grok-buid-app, app icon, packaging, scrub personal/harness paths"
}

Write-Host "== Push main ==" -ForegroundColor Cyan
git push -u origin main

Write-Host "Done. Create a GitHub Release with the files under release\ for in-app updates." -ForegroundColor Green
