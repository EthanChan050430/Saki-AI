@echo off
chcp 65001 > nul
TITLE Saki AI Starter
SETLOCAL

echo ==========================================
echo    Saki AI 自动启动脚本
echo ==========================================

REM 检测 Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js!
    pause
    exit /b
)

echo [1/1] 正在启动 Saki AI (包含后端和前端)...
echo 提示: 如果是第一次运行，可能需要较长时间安装依赖。
echo.


REM 检查是否需要安装依赖 (检查 node_modules 是否存在)
if not exist "node_modules" (
    echo [*] 正在安装项目管理依赖...
    call npm install
)
if not exist "backend\node_modules" (
    echo [*] 正在安装后端依赖...
    cd backend && call npm install && cd ..
)
if not exist "frontend\node_modules" (
    echo [*] 正在安装前端依赖...
    cd frontend && call npm install && cd ..
)

echo [*] 正在启动服务...
call npm run dev

echo.
echo ==========================================
echo    服务已停止。
echo ==========================================
pause
pause
