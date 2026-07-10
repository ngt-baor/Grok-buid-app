# Enforce: 1 project = 1 agent (disable Grok subagents globally)
# Safe merge into %USERPROFILE%\.grok\config.toml
# Run: powershell -ExecutionPolicy Bypass -File .\scripts\setup-one-agent-per-project.ps1

$ErrorActionPreference = "Stop"

$grokDir = Join-Path $env:USERPROFILE ".grok"
$configPath = Join-Path $grokDir "config.toml"
$backupPath = Join-Path $grokDir ("config.toml.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

if (-not (Test-Path $grokDir)) {
  New-Item -ItemType Directory -Path $grokDir | Out-Null
}

$block = @"
# --- one-agent-per-project (managed by setup-one-agent-per-project.ps1) ---
[subagents]
enabled = false
# --- end one-agent-per-project ---
"@

if (-not (Test-Path $configPath)) {
  Set-Content -Path $configPath -Value $block -Encoding UTF8
  Write-Host "Created $configPath with subagents disabled."
  exit 0
}

$raw = Get-Content -Path $configPath -Raw -ErrorAction SilentlyContinue
if ($null -eq $raw) { $raw = "" }

# Already managed?
if ($raw -match "one-agent-per-project \(managed by setup-one-agent-per-project") {
  Write-Host "Already configured: subagents block present in $configPath"
  exit 0
}

Copy-Item -Path $configPath -Destination $backupPath -Force
Write-Host "Backup: $backupPath"

# If [subagents] exists, rewrite enabled = false; else append block
if ($raw -match '(?m)^\[subagents\]') {
  # Set enabled = false under first [subagents] section if key exists, else inject after header
  if ($raw -match '(?ms)(\[subagents\][^\[]*?)enabled\s*=\s*\w+') {
    $raw = [regex]::Replace(
      $raw,
      '(?ms)(\[subagents\][^\[]*?)enabled\s*=\s*\w+',
      '${1}enabled = false',
      1
    )
  }
  else {
    $raw = [regex]::Replace(
      $raw,
      '(?m)^\[subagents\]\s*',
      "[subagents]`nenabled = false`n",
      1
    )
  }
  # Ensure marker comment for future idempotency
  if ($raw -notmatch "one-agent-per-project") {
    $raw = $raw.TrimEnd() + "`n`n# one-agent-per-project: subagents disabled`n"
  }
}
else {
  $raw = $raw.TrimEnd() + "`n`n" + $block + "`n"
}

$out = $raw.TrimEnd() + "`n"
Set-Content -Path $configPath -Value $out -Encoding UTF8
Write-Host "Updated $configPath — [subagents] enabled = false"
Write-Host "Restart Grok / Grok Build App sessions for this to apply."
Write-Host ""
Write-Host "Optional (current shell only):"
Write-Host '  $env:GROK_SUBAGENTS = "0"'
