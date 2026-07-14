# Source-only clean push to https://github.com/ngt-baor/Grok-buid-app.git
# Skips electron-builder (no dist:win). Safe paths only — no harness/secrets/build.
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\push-source-only.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "== Source-only push (no pack) ==" -ForegroundColor Cyan
Write-Host "Repo: https://github.com/ngt-baor/Grok-buid-app"
Write-Host "Cwd:  $root"

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
  'system_prompt.txt',
  'node_modules/',
  'dist/',
  'release/',
  '.exe'
)

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

Write-Host "== Stage files ==" -ForegroundColor Cyan
git add -A

$staged = git diff --cached --name-only
foreach ($f in $staged) {
  foreach ($p in $blockedPatterns) {
    if ($f -like "*$p*" -or $f -eq $p) {
      Write-Host "UNSTAGE blocked: $f" -ForegroundColor Yellow
      git reset HEAD -- "$f" 2>$null
    }
  }
}

# Drop any staged file with personal session paths in content
$staged2 = @(git diff --cached --name-only)
foreach ($f in $staged2) {
  if ($f -match '\.(png|jpg|jpeg|gif|ico|woff2?|exe|dll)$') { continue }
  try {
    $text = Get-Content -LiteralPath $f -Raw -ErrorAction SilentlyContinue
    if ($null -eq $text) { continue }
    $hasSessionPath =
      ($text -match 'C:[\\/]Users[\\/][^\\/\s]+[\\/]\.grok[\\/]sessions') -or
      ($text -match '\.grok[\\/]sessions[\\/]')
    if ($hasSessionPath) {
      Write-Host "UNSTAGE personal path content: $f" -ForegroundColor Red
      git reset HEAD -- "$f" 2>$null
    }
  } catch {}
}

Write-Host "== Staged ==" -ForegroundColor Cyan
git diff --cached --name-only
$stagedCount = @(git diff --cached --name-only).Count
if ($stagedCount -eq 0) {
  Write-Host "Nothing staged. Checking if local is ahead of origin..."
} else {
  $ver = "0.1.5"
  try {
    $pj = Get-Content package.json -Raw | ConvertFrom-Json
    if ($pj.version) { $ver = $pj.version }
  } catch {}
  git commit -m "Release $ver: full app source (auth, CLI install, i18n, markdown, electron, src)"
}

Write-Host "== Push main ==" -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) {
  Write-Host "Push failed (exit $LASTEXITCODE). Try: git push -u origin main" -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "== Done ==" -ForegroundColor Green
Write-Host "https://github.com/ngt-baor/Grok-buid-app"
Write-Host "Note: .exe is NOT in git — attach via GitHub Releases if needed."
