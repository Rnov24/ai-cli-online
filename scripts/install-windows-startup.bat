@echo off
setlocal enabledelayedexpansion
title AGY Online - Windows Auto-Start Installer

echo ================================================================
echo   AGY Online - Windows Auto-Start Configuration
echo ================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."

set "BIN_EXE=%CD%\bin\agy-online.exe"

if not exist "%BIN_EXE%" (
    echo [BUILD] agy-online.exe not found in bin\. Building now...
    go build -o "%BIN_EXE%" ./cmd/agy-online
    if not exist "%BIN_EXE%" (
        echo [ERROR] Failed to compile bin\agy-online.exe. Please ensure Go is installed.
        pause
        exit /b 1
    )
)

echo [OK] Binary found: %BIN_EXE%
echo.

"%BIN_EXE%" install-boot

echo.
echo Setup completed!
pause
