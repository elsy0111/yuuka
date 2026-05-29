#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Yuuka 更新スクリプト ==="

git pull
yarn install

# ポートが使用中なら先に解放
PORT=$(grep -E "^PORT:" config.yaml 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '"' || echo "7854")
pm2 stop yuuka 2>/dev/null || true
fuser -k "${PORT}/tcp" 2>/dev/null || true

yarn build

pm2 start yuuka
pm2 flush yuuka

echo "=== 更新完了 ==="
