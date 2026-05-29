#!/bin/bash
set -euo pipefail

PASS="✓"
WARN="⚠"
FAIL="✗"
HAS_ERROR=0

# 起動後サービス確認モード: ./checkhealth.sh --runtime
RUNTIME_MODE=false
if [[ "${1:-}" == "--runtime" ]]; then
  RUNTIME_MODE=true
fi

# config.yaml から値を取得するヘルパー
config_get() {
  grep -E "^$1:" config.yaml 2>/dev/null | head -1 | sed 's/^[^:]*:[[:space:]]*//' | tr -d '"'
}

# ==============================================================================
# ビルド前チェック
# ==============================================================================
echo "=== Yuuka ヘルスチェック ==="

# Node.js
if command -v node &>/dev/null; then
  echo "$PASS Node.js: $(node --version)"
else
  echo "$FAIL Node.js が見つかりません"
  HAS_ERROR=1
fi

# Rust / cargo
if command -v cargo &>/dev/null; then
  echo "$PASS cargo: $(cargo --version)"
else
  echo "$FAIL cargo が見つかりません。Rust をインストールしてください: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  HAS_ERROR=1
fi

# Chromium
CHROMIUM_PATH="${PUPPETEER_EXECUTABLE_PATH:-$(command -v chromium 2>/dev/null || command -v chromium-browser 2>/dev/null || echo "")}"
if [ -n "$CHROMIUM_PATH" ] && [ -x "$CHROMIUM_PATH" ]; then
  echo "$PASS chromium: $CHROMIUM_PATH"
else
  echo "$FAIL chromium が見つかりません: yay -S chromium"
  HAS_ERROR=1
fi

# Redis (任意: 未接続時は SQLite フォールバックで動作)
if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null 2>&1; then
  echo "$PASS Redis: 起動中"
else
  echo "$WARN Redis: 停止中（SQLite フォールバックで動作します）"
fi

# config.yaml 存在確認
if [ ! -f "config.yaml" ]; then
  echo "$FAIL config.yaml が見つかりません。example.yaml をコピーして設定してください"
  HAS_ERROR=1
else
  echo "$PASS config.yaml: 存在"

  # 必須キーの確認
  DISCORD_TOKEN=$(config_get "DISCORD_TOKEN")
  if [ -z "$DISCORD_TOKEN" ] || [ "$DISCORD_TOKEN" = "YOUR_DISCORD_BOT_TOKEN" ]; then
    echo "$FAIL DISCORD_TOKEN が未設定です"
    HAS_ERROR=1
  else
    echo "$PASS DISCORD_TOKEN: 設定済み"
  fi

  GEMINI_API_KEY=$(config_get "GEMINI_API_KEY")
  if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "YOUR_GEMINI_API_KEY" ]; then
    echo "$FAIL GEMINI_API_KEY が未設定です"
    HAS_ERROR=1
  else
    echo "$PASS GEMINI_API_KEY: 設定済み"
  fi

  ADMIN_TOKEN=$(config_get "ADMIN_TOKEN")
  if [ -z "$ADMIN_TOKEN" ]; then
    echo "$WARN ADMIN_TOKEN が未設定です（デフォルト値で動作します）"
  else
    echo "$PASS ADMIN_TOKEN: 設定済み"
  fi
fi

# data/ ディレクトリ
if [ -d "data" ] || mkdir -p "data" 2>/dev/null; then
  echo "$PASS data/: 存在（またはディレクトリ作成成功）"
else
  echo "$FAIL data/ ディレクトリを作成できません"
  HAS_ERROR=1
fi

# ポート使用確認
PORT=$(config_get "PORT")
PORT="${PORT:-7854}"
if ss -tlnp 2>/dev/null | grep -q ":$PORT " || netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
  echo "$WARN ポート $PORT は既に使用中です（既存プロセスが動いている可能性があります）"
else
  echo "$PASS ポート $PORT: 空き"
fi

echo "=========================="

if [ $HAS_ERROR -ne 0 ]; then
  echo "$FAIL ヘルスチェック失敗。上記のエラーを解消してからビルドしてください。"
  exit 1
fi

echo "$PASS すべてのビルド前チェックが通りました。"

# ==============================================================================
# 起動後サービス確認（--runtime オプション時のみ）
# ==============================================================================
if [ "$RUNTIME_MODE" = true ]; then
  echo ""
  echo "=== 起動後サービス確認 ==="

  # pm2 プロセス確認
  if command -v pm2 &>/dev/null; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null | grep -o '"name":"yuuka"' || echo "")
    if [ -n "$PM2_STATUS" ]; then
      PM2_STATUS_VAL=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; procs=[p for p in json.load(sys.stdin) if p['name']=='yuuka']; print(procs[0]['pm2_env']['status'] if procs else 'not found')" 2>/dev/null || echo "unknown")
      if [ "$PM2_STATUS_VAL" = "online" ]; then
        echo "$PASS pm2 [yuuka]: online"
      else
        echo "$FAIL pm2 [yuuka]: $PM2_STATUS_VAL"
      fi
    else
      echo "$FAIL pm2 に yuuka プロセスが見つかりません"
    fi
  else
    echo "$WARN pm2 が見つかりません"
  fi

  # Web サーバー応答確認
  PORT=$(config_get "PORT")
  PORT="${PORT:-7854}"
  HOST=$(config_get "HOST")
  HOST="${HOST:-127.0.0.1}"
  if curl -sf --max-time 3 "http://$HOST:$PORT/" &>/dev/null; then
    echo "$PASS Web サーバー (http://$HOST:$PORT): 応答あり"
  else
    echo "$FAIL Web サーバー (http://$HOST:$PORT): 応答なし"
  fi

  # Redis 接続確認
  if command -v redis-cli &>/dev/null && redis-cli ping &>/dev/null 2>&1; then
    echo "$PASS Redis: 接続OK"
  else
    echo "$WARN Redis: 応答なし（SQLite フォールバックで動作中）"
  fi

  echo "=========================="
fi
