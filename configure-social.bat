@echo off
title Configure Social Media Accounts
echo ========================================================
echo   PostFlow / Postmint: Social Media Auto-Configurator
echo ========================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your PATH.
    echo Please install Node.js from https://nodejs.org/ to run this tool.
    echo.
    pause
    exit /b 1
)

node "%~dp0auto-configure-social.js" %*
echo.
pause
