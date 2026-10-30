@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.12 or newer, then try again.
  pause
  exit /b 1
)
node scripts\launch.cjs %*
if errorlevel 1 (
  echo Saki AI failed to start. See the error above.
  pause
  exit /b 1
)
