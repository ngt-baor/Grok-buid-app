# Import the brand app icon PNG into assets/ + public/
# Usage:
#   1) Drop your square logo as assets\icon-source.png  OR
#   2) Pass -Source path\to\logo.png
#   3) powershell -ExecutionPolicy Bypass -File .\scripts\import-brand-icon.ps1
param(
  [string]$Source = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "assets"
$public = Join-Path $root "public"
New-Item -ItemType Directory -Force -Path $assets, $public | Out-Null

$candidates = @()
if ($Source) { $candidates += $Source }
$candidates += (Join-Path $assets "icon-source.png")
$candidates += (Join-Path $assets "icon.png")

# Optional: last Grok session attachment named image-*.png under this project sessions
$sessionRoot = Join-Path $env:USERPROFILE ".grok\sessions"
if (Test-Path $sessionRoot) {
  $hits = Get-ChildItem -Path $sessionRoot -Recurse -Filter "image-*.png" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match 'grok-buid-app' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 3
  foreach ($h in $hits) { $candidates += $h.FullName }
}

$src = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $src) {
  Write-Error "No source icon found. Pass -Source path\to\logo.png or place assets\icon-source.png"
}

$destPng = Join-Path $assets "icon.png"
Copy-Item -LiteralPath $src -Destination $destPng -Force
Copy-Item -LiteralPath $destPng -Destination (Join-Path $public "icon.png") -Force
Write-Host "Icon imported:"
Get-Item $destPng, (Join-Path $public "icon.png") | Format-Table FullName, Length -AutoSize
