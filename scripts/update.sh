#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Yuuka 更新スクリプト ==="

git pull
yarn install

yarn build

pm2 reload yuuka 2>/dev/null || pm2 start dist/index.js --name yuuka
pm2 flush yuuka

timeout 15 pm2 logs yuuka --lines 0 || true

echo "=== 更新完了 ==="
