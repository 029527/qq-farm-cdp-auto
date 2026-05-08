#!/usr/bin/env bash
cd "$(dirname "$0")"

export PYTHONUTF8=1
export NPM_CONFIG_UNICODE=true

echo ""
echo "=========================================="
echo "  QQ Farm Auto - Lite Float Mode"
echo "=========================================="
echo ""

if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js was not found. Please install Node.js 22 or newer."
    echo "Download: https://nodejs.org/"
    read -r -p "Press Enter to exit..."
    exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null)
if [ -z "$NODE_MAJOR" ]; then
    echo "[ERROR] Failed to detect Node.js version."
    read -r -p "Press Enter to exit..."
    exit 1
fi

if [ "$NODE_MAJOR" -lt 22 ]; then
    echo "[ERROR] Node.js 22 or newer is required. Current major version: $NODE_MAJOR"
    read -r -p "Press Enter to exit..."
    exit 1
fi

echo "[OK] Node.js v$NODE_MAJOR detected."
echo ""

while true; do
    echo "Select platform for QQ path matching:"
    echo "  [1] Windows"
    echo "  [2] macOS"
    echo ""
    read -r -p "Choose platform [1/2]: " PLATFORM_CHOICE
    case "$PLATFORM_CHOICE" in
        1)
            export FARM_LAUNCH_TARGET_PLATFORM="windows"
            break
            ;;
        2)
            export FARM_LAUNCH_TARGET_PLATFORM="macos"
            break
            ;;
        *)
            echo "Please enter 1 or 2."
            echo ""
            ;;
    esac
done

if [ ! -d "node_modules" ]; then
    echo ""
    echo "[INFO] node_modules not found. Installing dependencies..."
    export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "[ERROR] Dependency installation failed."
        read -r -p "Press Enter to exit..."
        exit 1
    fi
fi

if [ ! -d "node_modules/electron" ]; then
    echo ""
    echo "[INFO] Electron runtime not found. Installing dependencies..."
    export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "[ERROR] Electron installation failed."
        read -r -p "Press Enter to exit..."
        exit 1
    fi
fi

echo ""
echo "[INFO] Launching lite floating window..."
nohup npm run desktop:sample >/dev/null 2>&1 &
if [ $? -ne 0 ]; then
    echo ""
    read -r -p "Press Enter to exit..."
    exit 1
fi

echo "[OK] Lite float window started in background."
echo ""
