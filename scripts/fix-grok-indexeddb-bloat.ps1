<#
.SYNOPSIS
  Temporary fix: kill grok.exe and delete bloated x.com IndexedDB LevelDB (WAL .log can hit ~59 GB).

.DESCRIPTION
  Target:
    %APPDATA%\grok\IndexedDB\https_x.com_0.indexeddb.leveldb

  Steps:
    1) Force-kill Grok Desktop (grok.exe / Grok.exe)
    2) Delete the LevelDB directory (and any other x.com IndexedDB partitions)
    3) Optionally restart Grok Desktop

.PARAMETER RestartPath
  Full path to Grok Desktop executable. Auto-detected if omitted.

.PARAMETER SkipRestart
  Only kill + delete; do not relaunch.

.PARAMETER WhatIf
  Dry run — show actions without deleting/killing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\fix-grok-indexeddb-bloat.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\fix-grok-indexeddb-bloat.ps1 -SkipRestart
#>

[CmdletBinding()]
param(
  [string]$RestartPath = "",
  [switch]$SkipRestart,
  [switch]$WhatIf
)

$ErrorActionPreference = "Continue"

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

function Get-FolderSizeBytes([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return [int64]0 }
  $sum = (Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum).Sum
  if ($null -eq $sum) { return [int64]0 }
  return [int64]$sum
}

function Format-Size([int64]$bytes) {
  if ($bytes -ge 1GB) { return ("{0:N2} GB" -f ($bytes / 1GB)) }
  if ($bytes -ge 1MB) { return ("{0:N1} MB" -f ($bytes / 1MB)) }
  if ($bytes -ge 1KB) { return ("{0:N0} KB" -f ($bytes / 1KB)) }
  return "$bytes B"
}

function Find-GrokDesktopExe {
  param([string]$Preferred)

  if ($Preferred -and (Test-Path -LiteralPath $Preferred)) {
    return (Resolve-Path -LiteralPath $Preferred).Path
  }

  $guesses = @(
    (Join-Path $env:LOCALAPPDATA "Programs\grok\Grok.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Grok\Grok.exe"),
    (Join-Path $env:LOCALAPPDATA "grok\Grok.exe"),
    (Join-Path $env:LOCALAPPDATA "Grok\Grok.exe"),
    (Join-Path $env:ProgramFiles "Grok\Grok.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Grok\Grok.exe")
  )

  foreach ($g in $guesses) {
    if ($g -and (Test-Path -LiteralPath $g)) { return $g }
  }

  $shortcutRoots = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"),
    (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs"),
    [Environment]::GetFolderPath("Desktop")
  )
  foreach ($root in $shortcutRoots) {
    if (-not (Test-Path $root)) { continue }
    $lnk = Get-ChildItem -Path $root -Recurse -Filter "*Grok*.lnk" -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch 'CLI|Build' } |
      Select-Object -First 1
    if ($lnk) {
      try {
        $shell = New-Object -ComObject WScript.Shell
        $sc = $shell.CreateShortcut($lnk.FullName)
        if ($sc.TargetPath -and (Test-Path -LiteralPath $sc.TargetPath)) {
          return $sc.TargetPath
        }
      } catch { }
    }
  }

  return $null
}

Write-Host "Grok IndexedDB LevelDB WAL bloat fix" -ForegroundColor White
Write-Host "Machine: $env:COMPUTERNAME  User: $env:USERNAME"
Write-Host ("Time: {0:u}" -f (Get-Date).ToUniversalTime())

$idbRoot = Join-Path $env:APPDATA "grok\IndexedDB"
$targetDir = Join-Path $idbRoot "https_x.com_0.indexeddb.leveldb"

# ============================================================================
# 1) FORCE KILL grok.exe
# ============================================================================
Write-Step "1/3 Force-kill grok.exe"

$killed = @()
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -ieq "grok" -or $_.ProcessName -ieq "Grok"
}

if (-not $procs) {
  Write-Host "No grok.exe process running." -ForegroundColor DarkGray
} else {
  foreach ($p in $procs) {
    $pathHint = ""
    try { $pathHint = $p.Path } catch { }
    Write-Host ("Killing PID {0} ({1}) {2}" -f $p.Id, $p.ProcessName, $pathHint)
    if (-not $WhatIf) {
      try {
        Stop-Process -Id $p.Id -Force -ErrorAction Stop
        $killed += $p.Id
      } catch {
        & taskkill.exe /F /PID $p.Id 2>$null | Out-Null
        $killed += $p.Id
      }
    }
  }
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    $still = Get-Process -Name "grok","Grok" -ErrorAction SilentlyContinue
    if (-not $still) { break }
    Start-Sleep -Milliseconds 300
  }
  $still = Get-Process -Name "grok","Grok" -ErrorAction SilentlyContinue
  if ($still) {
    Write-Host "WARNING: Some grok processes still alive:" -ForegroundColor Yellow
    $still | Format-Table Id, ProcessName -AutoSize
  } else {
    Write-Host ("Killed {0} process(es)." -f $killed.Count) -ForegroundColor Green
  }
}

# Extra settle so LevelDB releases file handles
Start-Sleep -Seconds 1

# ============================================================================
# 2) DELETE IndexedDB LevelDB directory
# ============================================================================
Write-Step "2/3 Delete %APPDATA%\grok\IndexedDB\https_x.com_0.indexeddb.leveldb"

Write-Host "Target: $targetDir"
$sizeBefore = [int64]0

if (-not (Test-Path -LiteralPath $targetDir)) {
  Write-Host "Primary directory not found (already clean or different profile)." -ForegroundColor Yellow
} else {
  $sizeBefore = Get-FolderSizeBytes $targetDir
  Write-Host ("Size before delete: {0}" -f (Format-Size $sizeBefore)) -ForegroundColor Yellow

  if ($WhatIf) {
    Write-Host "WhatIf: would delete $targetDir"
  } else {
    try {
      Remove-Item -LiteralPath $targetDir -Recurse -Force -ErrorAction Stop
      Write-Host "Deleted successfully." -ForegroundColor Green
    } catch {
      Write-Host "Remove-Item failed: $($_.Exception.Message)" -ForegroundColor Red
      Write-Host "Retrying via cmd rmdir..."
      & cmd.exe /c "rmdir /s /q `"$targetDir`""
      if (Test-Path -LiteralPath $targetDir) {
        Write-Host "FAILED to delete. Close all Grok windows and retry." -ForegroundColor Red
        Write-Host "Manual path: $targetDir"
        exit 2
      }
      Write-Host "Deleted via rmdir." -ForegroundColor Green
    }
  }
}

# Any other x.com partitions under IndexedDB
if (Test-Path -LiteralPath $idbRoot) {
  $extras = Get-ChildItem -LiteralPath $idbRoot -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'x\.com' }
  foreach ($ex in $extras) {
    $sz = Get-FolderSizeBytes $ex.FullName
    Write-Host ("Also removing: {0} ({1})" -f $ex.FullName, (Format-Size $sz))
    $sizeBefore += $sz
    if (-not $WhatIf) {
      Remove-Item -LiteralPath $ex.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
} else {
  Write-Host "IndexedDB root missing: $idbRoot" -ForegroundColor DarkGray
}

if (-not (Test-Path -LiteralPath $targetDir)) {
  Write-Host ("Freed approximately {0}" -f (Format-Size $sizeBefore)) -ForegroundColor Green
}

# ============================================================================
# 3) RESTART (optional)
# ============================================================================
if ($SkipRestart) {
  Write-Step "3/3 Skip restart (-SkipRestart)"
  Write-Host "Done. Relaunch Grok Desktop manually."
  exit 0
}

Write-Step "3/3 Restart Grok Desktop"

$exe = Find-GrokDesktopExe -Preferred $RestartPath
if (-not $exe) {
  Write-Host "Could not locate Grok Desktop .exe — cleanup finished." -ForegroundColor Yellow
  Write-Host "Tip: -RestartPath 'C:\full\path\Grok.exe'"
  exit 0
}

Write-Host "Launching: $exe"
if ($WhatIf) {
  Write-Host "WhatIf: would start $exe"
  exit 0
}

try {
  Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -ErrorAction Stop
  Start-Sleep -Seconds 2
  $alive = Get-Process -Name "grok","Grok" -ErrorAction SilentlyContinue
  if ($alive) {
    Write-Host ("Grok restarted (PID: {0})." -f (($alive | Select-Object -ExpandProperty Id) -join ", ")) -ForegroundColor Green
  } else {
    Write-Host "Started process; if tray-only, check system tray." -ForegroundColor Yellow
  }
} catch {
  Write-Host "Failed to start: $($_.Exception.Message)" -ForegroundColor Red
  exit 3
}

Write-Host ""
Write-Host "All steps completed. IndexedDB recreates cleanly on next use (KB–MB)." -ForegroundColor Green
exit 0
