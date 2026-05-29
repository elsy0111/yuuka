#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Yuuka 更新スクリプト ==="

git pull
yarn install

# ポートが使用中なら先に解放し、空くまで待機
PORT=$(grep -E "^PORT:" config.yaml 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '"' || echo "7854")
pm2 stop yuuka 2>/dev/null || true
fuser -k "${PORT}/tcp" 2>/dev/null || true
echo -n "ポート解放待機中"
for i in $(seq 1 20); do
  sleep 0.5
  echo -n "."
  if ! fuser "${PORT}/tcp" &>/dev/null 2>&1; then
    echo " 解放完了"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo " タイムアウト"
  fi
done

yarn build

pm2 start yuuka
pm2 flush yuuka

echo -n "起動待機中"
for i in 1 2 3; do sleep 1; echo -n "."; done
echo ""
timeout 10 pm2 logs yuuka --lines 0 || true

echo "=== 更新完了 ==="
