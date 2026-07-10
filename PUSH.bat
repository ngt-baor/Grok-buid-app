@echo off
cd /d "%~dp0"
echo.
echo === Grok Build: package + clean push to GitHub ===
echo Repo: https://github.com/ngt-baor/Grok-buid-app
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\push-clean.ps1"
if errorlevel 1 (
  echo FAILED.
  pause
  exit /b 1
)
echo.
echo Done. Attach release\*.exe on GitHub Releases if you packaged.
pause
