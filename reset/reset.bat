@echo off
chcp 65001 > nul
TITLE Saki AI Reset Tool
color 0c

echo.
echo ==========================================
echo    Saki AI 数据重置工具
echo ==========================================
echo.
echo [警告] 此操作将彻底清除所有用户数据，包括：
echo.
echo  1. 所有聊天记录 (Sessions)
echo  2. 所有上传的文件和生成的报告 (Files, Uploads, Reports)
echo  3. 所有的记忆与自动任务 (Memories, Tasks)
echo  4. 所有的配置与密码 (Config, Auth)
echo.
echo  !!! 此操作不可逆，请谨慎执行 !!!
echo.

set /p choice=确认要重置所有数据吗? (输入 Y 确认, 其他键取消): 
if /i "%choice%" neq "Y" goto :Cancelled

echo.
echo [*] 正在停止可能的 Node.js 进程以解除文件占用...
taskkill /F /IM node.exe >nul 2>&1

echo.
echo [1/4] 清理数据文件夹...

REM 清理文件夹但保留目录结构
if exist "data\files" (
    rmdir /s /q "data\files"
    mkdir "data\files"
)
if exist "data\memories" (
    rmdir /s /q "data\memories"
    mkdir "data\memories"
)
if exist "data\reports" (
    rmdir /s /q "data\reports"
    mkdir "data\reports"
)
if exist "data\sessions" (
    rmdir /s /q "data\sessions"
    mkdir "data\sessions"
)
if exist "data\Trash" (
    rmdir /s /q "data\Trash"
    mkdir "data\Trash"
)
if exist "data\uploads" (
    rmdir /s /q "data\uploads"
    mkdir "data\uploads"
)

echo [2/4] 重置记录文件...
echo []> "data\history.json"
echo []> "data\hosted_tasks.json"

echo [3/4] 删除配置文件...
if exist "data\auth.json" del /f /q "data\auth.json"
if exist "data\global_config.json" del /f /q "data\global_config.json"
if exist "data\mcp_config.json" del /f /q "data\mcp_config.json"

echo [4/4] 清理完成。

echo.
echo ==========================================
echo    重置成功！
echo ==========================================
echo 您现在可以运行 start.bat 重新初始化项目。
echo.
pause
exit /b

:Cancelled
echo.
echo [!] 操作已取消，未进行任何更改。
pause
