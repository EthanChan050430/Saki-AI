@echo off
chcp 65001 > nul
TITLE Saki AI Starter
SETLOCAL
set "QQBOT_AUTO_CONNECT=1"

echo ==========================================
echo    Saki AI Starter
echo ==========================================

REM Check Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js was not detected. Please install Node.js first.
    pause
    exit /b 1
)

echo [1/1] Starting Saki AI (backend + normal web[5432])...
echo Tip: First startup may take longer while dependencies are installed.
echo.

REM Optionally start GPT-SoVITS if it is present.
if exist "GPT-SoVITS-v2pro-20250604" (
    echo [*] Detected GPT-SoVITS directory.
    echo [*] Starting GPT-SoVITS voice service in the background...
    start /min "GPT-SoVITS API" cmd /c "cd GPT-SoVITS-v2pro-20250604 && runtime\python.exe api_v2.py -a 127.0.0.1 -p 9880"
    echo [!] Voice service startup command sent. Please wait about 10-20 seconds for initialization.
    echo.
)

REM Optionally start Stable Diffusion if it is present.
if exist "sd" (
    echo [*] Detected Stable Diffusion directory.
    echo [*] Starting Stable Diffusion API in the background...
    start /min "Stable Diffusion API" cmd /c "cd sd && call run.bat"
    echo [!] Stable Diffusion startup command sent. Please wait about 30-60 seconds for initialization.
    echo.
)

REM Install dependencies when needed.
if not exist "node_modules" (
    echo [*] Installing root dependencies...
    call npm install
)
if not exist "backend\node_modules" (
    echo [*] Installing backend dependencies...
    cd backend && call npm install && cd ..
)
if not exist "frontend\node_modules" (
    echo [*] Installing frontend dependencies...
    cd frontend && call npm install && cd ..
)

echo.
echo ==========================================
echo    Starting normal web mode only
echo    Backend:    http://localhost:5431
echo    Normal web: http://localhost:5432
echo ==========================================
echo.

call npm run dev

echo.
echo ==========================================
echo    Services stopped
echo ==========================================
pause
