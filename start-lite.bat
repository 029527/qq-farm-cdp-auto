@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
chcp 65001 >nul
set "PYTHONUTF8=1"
set "NPM_CONFIG_UNICODE=true"

title QQ Farm Auto - Lite Float Mode

echo.
echo ==========================================
echo   QQ Farm Auto - Lite Float Mode
echo ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found. Please install Node.js 22 or newer.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

for /f %%i in ('node -p "process.versions.node.split(\".\")[0]"') do set "NODE_MAJOR=%%i"
if not defined NODE_MAJOR (
    echo [ERROR] Failed to detect Node.js version.
    pause
    exit /b 1
)

if %NODE_MAJOR% LSS 22 (
    echo [ERROR] Node.js 22 or newer is required. Current major version: %NODE_MAJOR%
    pause
    exit /b 1
)

echo [OK] Node.js v%NODE_MAJOR% detected.
echo.
echo Select platform for QQ path matching:
echo   [1] Windows
echo   [2] macOS

choice /c 12 /n /m "Choose platform [1/2]: "
if errorlevel 2 (
    set "FARM_LAUNCH_TARGET_PLATFORM=macos"
) else (
    set "FARM_LAUNCH_TARGET_PLATFORM=windows"
)

if not exist "node_modules" (
    echo [INFO] node_modules not found. Installing dependencies...
    set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
    npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
)

if not exist "node_modules\\electron" (
    echo [INFO] Electron runtime not found. Installing dependencies...
    set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
    npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] Electron installation failed.
        pause
        exit /b 1
    )
)

echo.
echo [INFO] Launching lite floating window...
call npm run desktop:sample
if errorlevel 1 (
    echo.
    pause
    exit /b 1
)

endlocal
