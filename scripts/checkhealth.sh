#!/bin/bash
set -euo pipefail

PASS="✓"
WARN="⚠"
FAIL="✗"
HAS_ERROR=0

echo "=== Yuuka ヘルスチェック ==="

# Node.js
if command -v node &>/dev/null; then
  echo "$PASS Node.js: $(node --version)"
else
  echo "$FAIL Node.js が見つかりません"
  HAS_ERROR=1
fi

# Rust / cargo (Rustクローラーのビルドに必要)
if command -v cargo &>/dev/null; then
  echo "$PASS cargo: $(cargo --version)"
else
  echo "$FAIL cargo が見つかりません。Rust をインストールしてください: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  HAS_ERROR=1
fi

# Chromium (Puppeteerのスクレイピングに必要)
CHROMIUM_PATH="${PUPPETEER_EXECUTABLE_PATH:-$(command -v chromium 2>/dev/null || command -v chromium-browser 2>/dev/null || echo "")}"
if [ -n "$CHROMIUM_PATH" ] && [ -x "$CHROMIUM_PATH" ]; then
  echo "$PASS chromium: $CHROMIUM_PATH"
else
  echo "$FAIL chromium が見つかりません。インストールしてください: yay -S chromium"
  HAS_ERROR=1
fi

# Redis (任意: 未接続時は SQLite フォールバックで動作)
if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null 2>&1; then
  echo "$PASS Redis: 起動中"
else
  echo "$WARN Redis: 停止中（SQLite フォールバックで動作します）"
fi

# config.yaml
if [ -f "config.yaml" ]; then
  echo "$PASS config.yaml: 存在"
else
  echo "$FAIL config.yaml が見つかりません。example.yaml をコピーして設定してください"
  HAS_ERROR=1
fi

echo "=========================="

if [ $HAS_ERROR -ne 0 ]; then
  echo "$FAIL ヘルスチェック失敗。上記のエラーを解消してからビルドしてください。"
  exit 1
fi

echo "$PASS すべてのチェックが通りました。"
