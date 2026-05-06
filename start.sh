#!/usr/bin/env bash
cd "$(dirname "$0")"

echo ""
echo "=========================================="
echo "  QQ Farm Auto - Quick Start"
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
echo "Select runtime:"
echo "  [1] QQ     WebSocket host + QQ bundle"
echo "  [2] WeChat CDP + auto inject button.js"
echo ""

while true; do
    read -r -p "Choose runtime [1/2]: " CHOICE
    case "$CHOICE" in
        1)
            RUNTIME_FLAG="--qq"
            RUNTIME_NAME="QQ"
            break
            ;;
        2)
            RUNTIME_FLAG="--wx"
            RUNTIME_NAME="WeChat"
            break
            ;;
        *)
            echo "Please enter 1 or 2."
            ;;
    esac
done

echo ""
echo "Selected runtime: $RUNTIME_NAME"
echo ""

node setup.cjs "$RUNTIME_FLAG"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "[ERROR] Startup failed. Please check the log above."
    read -r -p "Press Enter to exit..."
    exit 1
fi
