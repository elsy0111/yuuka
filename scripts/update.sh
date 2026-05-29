#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Yuuka 更新スクリプト ==="

git pull
yarn install

pm2 stop yuuka 2>/dev/null || true

yarn build

pm2 start yuuka
pm2 flush yuuka

timeout 15 pm2 logs yuuka --lines 0 || true

echo "=== 更新完了 ==="
