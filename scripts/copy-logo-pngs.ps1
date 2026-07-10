$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $root 'assets'
$destDir = Join-Path $root 'public'
$names = @('logo-light.png', 'logo-dark.png', 'icon.svg', 'icon.png')

New-Item -ItemType Directory -Force -Path $destDir | Out-Null
foreach ($name in $names) {
  $src = Join-Path $sourceDir $name
  if (-not (Test-Path -LiteralPath $src)) {
    Write-Warning "skip (missing): $src"
    continue
  }
  $dest = Join-Path $destDir $name
  Copy-Item -LiteralPath $src -Destination $dest -Force
  Get-Item -LiteralPath $dest | Select-Object FullName, Length
}
