@echo off
cd /d "%~dp0"
echo.
echo === Grok Build: pack Windows installers ===
echo Output: release\
echo Repo:   https://github.com/ngt-baor/Grok-buid-app
echo.
echo Will npm install if electron-builder is missing, then pack.
echo After build, Explorer opens release\ so you can drag .exe onto GitHub Releases.
echo.
echo Optional: pass publish to also create GitHub release via gh CLI
echo   BUILD-RELEASE.bat publish
echo.

if /I "%~1"=="publish" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-and-open-release.ps1" -Publish
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-and-open-release.ps1"
)

if errorlevel 1 (
  echo.
  echo FAILED.
  pause
  exit /b 1
)

echo.
pause
