@echo off
setlocal
chcp 65001 > nul

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Configuration wizard failed with exit code %EXIT_CODE%.
)

echo.
pause
exit /b %EXIT_CODE%
