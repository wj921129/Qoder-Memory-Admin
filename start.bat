@echo off
setlocal
cd /d "%~dp0"
title Qoder Memory Hub
cls

where node >nul 2>nul
if errorlevel 1 goto :no_node

echo ============================================================
echo  正在启动 Qoder Memory 工业级记忆拓扑管理平台...
echo ============================================================
echo.

node server\server.mjs %*
set "EXIT_CODE=%errorlevel%"

if %EXIT_CODE% neq 0 (
  echo.
  echo ============================================================
  echo [ERROR] 服务运行异常终止，退出代码: %EXIT_CODE%
  echo ============================================================
  echo.
  pause
  exit /b %EXIT_CODE%
)

echo.
echo 服务已停止。按任意键关闭窗口...
pause >nul
goto :eof

:no_node
echo.
echo ============================================================
echo [ERROR] 未在系统 PATH 中检测到 Node.js 运行环境！
echo 请从 https://nodejs.org 下载并安装 Node.js 18+
echo ============================================================
echo.
pause
exit /b 1
