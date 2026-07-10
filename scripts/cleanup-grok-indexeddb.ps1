# Cleanup bloated Grok Desktop IndexedDB (LevelDB WAL) for x.com origin.
# Safe: only removes IndexedDB under %APPDATA%\grok (official desktop).
# Does NOT delete grok-build-app or CLI ~/.grok sessions.

$ErrorActionPreference = "Stop"

Write-Host "=== Grok IndexedDB cleanup ===" -ForegroundColor Cyan

# 1) Warn if processes still running
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -match '^(Grok|grok)$' -or
  ($_.ProcessName -eq 'electron' -and $_.Path -match 'grok')
}
if ($procs) {
  Write-Host "WARNING: Still running:" -ForegroundColor Yellow
  $procs | Format-Table ProcessName, Id, Path -AutoSize
  Write-Host "Close Grok Desktop fully, then re-run. Aborting." -ForegroundColor Red
  exit 1
}

$base = Join-Path $env:APPDATA "grok"
$idb = Join-Path $base "IndexedDB"
$target = Join-Path $idb "https_x.com_0.indexeddb.leveldb"

function FolderSizeGB([string]$path) {
  if (-not (Test-Path $path)) { return 0 }
  $sum = (Get-ChildItem $path -Recurse -Force -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum
  if (-not $sum) { return 0 }
  return [math]::Round($sum / 1GB, 2)
}

if (-not (Test-Path $base)) {
  Write-Host "Official Grok Desktop data folder not found: $base" -ForegroundColor Yellow
  Write-Host "Nothing to clean for this path."
  exit 0
}

Write-Host ("grok AppData size before: {0} GB" -f (FolderSizeGB $base))

$removed = @()
if (Test-Path $target) {
  Write-Host ("Removing {0} GB -> {1}" -f (FolderSizeGB $target), $target) -ForegroundColor Yellow
  Remove-Item -Path $target -Recurse -Force
  $removed += $target
} else {
  Write-Host "Primary target missing: $target"
}

# Any other x.com origin partitions
if (Test-Path $idb) {
  Get-ChildItem $idb -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'x\.com' } |
    ForEach-Object {
      Write-Host ("Removing {0} GB -> {1}" -f (FolderSizeGB $_.FullName), $_.FullName) -ForegroundColor Yellow
      Remove-Item $_.FullName -Recurse -Force
      $removed += $_.FullName
    }
}

if ($removed.Count -eq 0) {
  Write-Host "No x.com IndexedDB folders found under $idb" -ForegroundColor Green
} else {
  Write-Host "Removed $($removed.Count) folder(s)." -ForegroundColor Green
}

Write-Host ("grok AppData size after: {0} GB" -f (FolderSizeGB $base))
Write-Host "Done. Relaunch Grok Desktop to recreate a clean DB."
exit 0
