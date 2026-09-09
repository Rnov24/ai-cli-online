@echo off
title AGY Online - Windows Auto-Start Uninstaller

echo ================================================================
echo   AGY Online - Remove Windows Auto-Start
echo ================================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."

set "BIN_EXE=%CD%\bin\agy-online.exe"

if exist "%BIN_EXE%" (
    "%BIN_EXE%" uninstall-boot
) else (
    set "VBS_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\start-agy-online.vbs"
    if exist "!VBS_FILE!" (
        del /f /q "!VBS_FILE!"
        echo Removed: !VBS_FILE!
    ) else (
        echo No auto-start launcher found in Startup folder.
    )
)

echo.
echo Uninstallation completed!
pause
