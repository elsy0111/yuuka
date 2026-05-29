#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Yuuka 更新スクリプト ==="

git pull
yarn install
yarn build

# ポートが使用中なら解放
PORT=$(grep -E "^PORT:" config.yaml 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '"' || echo "7854")
fuser -k "${PORT}/tcp" 2>/dev/null || true

pm2 restart yuuka

echo "=== 更新完了 ==="
