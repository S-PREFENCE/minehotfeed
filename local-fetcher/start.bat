@echo off
chcp 65001 >nul
title HotFeed 本地抓取守护进程

echo ============================================
echo   HotFeed 热点抓取守护进程
echo   每10分钟自动抓取热点并推送到云端
echo ============================================
echo.

cd /d "%~dp0"

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 检查并安装依赖
echo [检查] 安装依赖...
pip install requests -q 2>&1

echo.
echo [启动] 开始守护进程模式...
echo.

python fetch_and_push.py --daemon --interval 600

pause
