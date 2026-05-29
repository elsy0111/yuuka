#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

PORT=$(grep -E "^PORT:" config.yaml 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '"' || echo "7854")

# ポートを解放し、2秒間安定して空いていることを確認する
wait_port_stable() {
  echo -n "ポート解放待機中"
  for i in $(seq 1 30); do
    fuser -k "${PORT}/tcp" 2>/dev/null || true
    sleep 0.5
    echo -n "."
    if ! fuser "${PORT}/tcp" &>/dev/null 2>&1; then
      # 空きを確認したら、さらに1秒待って再確認
      sleep 1
      if ! fuser "${PORT}/tcp" &>/dev/null 2>&1; then
        echo " 解放完了"
        return 0
      fi
    fi
  done
  echo " タイムアウト（強行起動します）"
}

echo "=== Yuuka 更新スクリプト ==="

git pull
yarn install

pm2 stop yuuka 2>/dev/null || true

# pm2のクラッシュループが落ち着くまで待機
wait_port_stable

yarn build

# ビルド中に再取得された場合に備えて再度解放
wait_port_stable

pm2 delete yuuka 2>/dev/null || true
wait_port_stable
pm2 start dist/index.js --name yuuka
pm2 flush yuuka

timeout 15 pm2 logs yuuka --lines 0 || true

echo "=== 更新完了 ==="
