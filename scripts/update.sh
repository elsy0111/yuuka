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
pm2 delete yuuka 2>/dev/null || true
pm2 save --force 2>/dev/null || true  # startup hook による自動復活を防ぐ

# pm2のクラッシュループが落ち着くまで待機
wait_port_stable

yarn build

# 起動直前に最終確認・強制解放
wait_port_stable
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 1

pm2 start dist/index.js --name yuuka
pm2 save 2>/dev/null || true  # 新プロセスをstartup hookに登録
pm2 flush yuuka

timeout 15 pm2 logs yuuka --lines 0 || true

echo "=== 更新完了 ==="
