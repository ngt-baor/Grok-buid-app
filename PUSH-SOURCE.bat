@echo off
cd /d "%~dp0"
echo.
echo === Grok Build: source-only push to GitHub ===
echo Repo: https://github.com/ngt-baor/Grok-buid-app
echo Skips packaging. Pushes electron/ src/ docs/ package.json etc.
echo Does NOT push AGENTS.md, .agents, auth, node_modules, release.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\push-source-only.ps1"
if errorlevel 1 (
  echo.
  echo FAILED.
  pause
  exit /b 1
)
echo.
echo Done. Open: https://github.com/ngt-baor/Grok-buid-app
pause
