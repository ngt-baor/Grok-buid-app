# Build Windows installers and open the release folder.
# Optional: -Publish creates GitHub Release via gh CLI.
#
# powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-and-open-release.ps1
# powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-and-open-release.ps1 -Publish

param(
  [switch]$Publish
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pkgPath = Join-Path $root 'package.json'
$pkg = (Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8) | ConvertFrom-Json
$version = [string]$pkg.version
if (-not $version) { throw 'package.json missing version' }

$tag = 'v' + $version
$repo = 'ngt-baor/Grok-buid-app'
$releaseDir = Join-Path $root 'release'

Write-Host ('== Grok Build: pack Windows (' + $tag + ') ==') -ForegroundColor Cyan
Write-Host ('Repo: https://github.com/' + $repo)
Write-Host ('Out:  ' + $releaseDir)
Write-Host ''

# --- ensure electron-builder installed ---
$ebCli = Join-Path $root 'node_modules\electron-builder\cli.js'
$ebBin = Join-Path $root 'node_modules\.bin\electron-builder.cmd'
if (-not (Test-Path -LiteralPath $ebCli) -and -not (Test-Path -LiteralPath $ebBin)) {
  Write-Host '== npm install (electron-builder missing) ==' -ForegroundColor Yellow
  & npm install
  if ($LASTEXITCODE -ne 0) { throw ('npm install failed: ' + $LASTEXITCODE) }
}

function Stop-LockingProcesses {
  foreach ($n in @('Grok Build', 'Grok Build Setup', 'app-builder')) {
    Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
      Write-Host ('  stop: ' + $_.ProcessName + ' pid=' + $_.Id)
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Get-Process -Name 'electron' -ErrorAction SilentlyContinue | ForEach-Object {
    $path = ''
    try { $path = [string]$_.Path } catch { }
    if ($path -and (($path -like '*grok-buid-app*') -or ($path -like '*Grok Build*'))) {
      Write-Host ('  stop: electron pid=' + $_.Id)
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

function Remove-TreeForce {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $true }
  try {
    Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
      try { $_.Attributes = 'Normal' } catch { }
    }
  } catch { }
  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

Write-Host '== Unlock + clean release\ (EPERM fix) ==' -ForegroundColor Cyan
Stop-LockingProcesses
Start-Sleep -Milliseconds 800

try {
  $shell = New-Object -ComObject Shell.Application
  foreach ($w in @($shell.Windows())) {
    try {
      $loc = [string]$w.LocationURL
      if ($loc -and ($loc -match 'grok-buid-app[/\\]release')) {
        $w.Quit()
      }
    } catch { }
  }
} catch { }

$cleaned = $false
for ($i = 1; $i -le 5; $i++) {
  if (-not (Test-Path -LiteralPath $releaseDir)) {
    $cleaned = $true
    break
  }
  Write-Host ('  attempt ' + $i + ': remove release\')
  $null = Remove-TreeForce (Join-Path $releaseDir 'win-unpacked')
  $null = Remove-TreeForce (Join-Path $releaseDir 'win-unpacked.tmp')
  if (Remove-TreeForce $releaseDir) {
    $cleaned = $true
    break
  }
  Stop-LockingProcesses
  Start-Sleep -Seconds 2
}

if (-not $cleaned -and (Test-Path -LiteralPath $releaseDir)) {
  Write-Warning 'Trying cmd rmdir...'
  cmd /c ('rmdir /s /q "' + $releaseDir + '"')
  Start-Sleep -Seconds 1
}

if (Test-Path -LiteralPath $releaseDir) {
  Write-Warning 'release\ still exists. Close Explorer on that folder and Grok Build, then re-run.'
} else {
  Write-Host '  release\ cleared.'
}

Write-Host '== npm run dist:win ==' -ForegroundColor Cyan
& npm run dist:win
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host 'If EPERM rename win-unpacked:' -ForegroundColor Yellow
  Write-Host '  1. Close Grok Build'
  Write-Host '  2. Close Explorer on D:\grok-buid-app\release'
  Write-Host '  3. Re-run BUILD-RELEASE.bat'
  throw ('dist:win failed: ' + $LASTEXITCODE)
}

if (-not (Test-Path -LiteralPath $releaseDir)) {
  throw 'release folder missing after dist:win'
}

$all = @(Get-ChildItem -LiteralPath $releaseDir -File | Sort-Object Name)
$exes = @($all | Where-Object { $_.Extension -eq '.exe' })
$blockmaps = @($all | Where-Object { $_.Name -like '*.blockmap' })
$yml = @($all | Where-Object {
  $n = $_.Name
  ($n -like 'latest*.yml') -or ($n -like 'builder-*.yml')
})

Write-Host ''
Write-Host '== Artifacts in release\ ==' -ForegroundColor Cyan
foreach ($f in $all) {
  $mb = [math]::Round($f.Length / 1MB, 2)
  Write-Host ('  ' + $f.Name + '  ' + $mb + ' MB')
}

Write-Host ''
if ($exes.Count -eq 0) {
  Write-Warning 'No .exe in release\'
} else {
  Write-Host 'Upload these (Setup preferred for in-app update):' -ForegroundColor Green
  foreach ($e in $exes) {
    Write-Host ('  - ' + $e.Name)
  }
  foreach ($b in $blockmaps) {
    Write-Host ('  - ' + $b.Name + ' (optional)')
  }
  foreach ($y in $yml) {
    Write-Host ('  - ' + $y.Name + ' (optional)')
  }
}

Write-Host ''
Write-Host '== Open Explorer ==' -ForegroundColor Cyan
Start-Process -FilePath 'explorer.exe' -ArgumentList $releaseDir

if ($Publish) {
  Write-Host ''
  Write-Host ('== Publish GitHub Release ' + $tag + ' ==') -ForegroundColor Cyan
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'gh CLI not found. Install GitHub CLI and run: gh auth login'
  }
  & gh auth status 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'gh not authenticated. Run: gh auth login' }
  if ($exes.Count -eq 0) { throw 'No .exe to upload' }

  $paths = @($exes | ForEach-Object { $_.FullName })
  $fileLines = @($exes | ForEach-Object { '- ' + $_.Name })
  $notes = @(
    ('## Grok Build ' + $tag),
    '',
    'Windows packages from electron-builder (NSIS + portable).',
    '',
    '### Files'
  ) + $fileLines + @(
    '',
    '### Notes',
    '- In-app update prefers the Setup .exe',
    ('- App version: ' + $version)
  )
  $notesText = $notes -join "`n"

  $null = & gh release view $tag --repo $repo 2>&1
  $exists = ($LASTEXITCODE -eq 0)

  if ($exists) {
    Write-Host 'Release exists - uploading assets...'
    foreach ($p in $paths) {
      & gh release upload $tag $p --repo $repo --clobber
      if ($LASTEXITCODE -ne 0) { throw ('upload failed: ' + $p) }
    }
  } else {
    Write-Host ('Creating release ' + $tag + '...')
    $ghArgs = @('release', 'create', $tag) + $paths + @(
      '--repo', $repo,
      '--title', ('Grok Build ' + $tag),
      '--notes', $notesText
    )
    & gh @ghArgs
    if ($LASTEXITCODE -ne 0) { throw 'gh release create failed' }
  }

  Write-Host ''
  Write-Host ('Published: https://github.com/' + $repo + '/releases/tag/' + $tag) -ForegroundColor Green
} else {
  Write-Host ''
  Write-Host 'Next (manual):' -ForegroundColor Cyan
  Write-Host ('  1. Open https://github.com/' + $repo + '/releases/new')
  Write-Host ('  2. Tag: ' + $tag)
  Write-Host '  3. Drag .exe from release\ into Assets'
  Write-Host ''
  Write-Host 'Or: BUILD-RELEASE.bat publish  (needs gh auth login)'
}

Write-Host ''
Write-Host 'Done.' -ForegroundColor Green
