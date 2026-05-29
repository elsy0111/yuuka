#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

PORT=$(grep -E "^PORT:" config.yaml 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '"' || echo "7854")

wait_port_free() {
  echo -n "ポート解放待機中"
  fuser -k "${PORT}/tcp" 2>/dev/null || true
  for i in $(seq 1 20); do
    sleep 0.5
    echo -n "."
    if ! fuser "${PORT}/tcp" &>/dev/null 2>&1; then
      echo " 解放完了"
      return 0
    fi
    fuser -k "${PORT}/tcp" 2>/dev/null || true
  done
  echo " タイムアウト（強行起動します）"
}

echo "=== Yuuka 更新スクリプト ==="

git pull
yarn install

pm2 stop yuuka 2>/dev/null || true

yarn build

# ビルド後・起動直前にポートを解放
wait_port_free

pm2 start yuuka
pm2 flush yuuka

echo -n "起動待機中"
for i in 1 2 3; do sleep 1; echo -n "."; done
echo ""
timeout 10 pm2 logs yuuka --lines 0 || true

echo "=== 更新完了 ==="
