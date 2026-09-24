@echo off
cd /d "%~dp0"
title Qoder Memory Hub
cls

where node >nul 2>nul
if errorlevel 1 goto :no_node

node server\server.mjs %*
if errorlevel 1 goto :server_err
goto :eof

:no_node
echo.
echo ============================================================
echo [ERROR] Node.js is not found in your system PATH!
echo Please install Node.js from https://nodejs.org (v18+)
echo ============================================================
echo.
pause
exit /b 1

:server_err
echo.
echo ============================================================
echo [ERROR] Server stopped with error code %errorlevel%.
echo ============================================================
echo.
pause
exit /b %errorlevel%
