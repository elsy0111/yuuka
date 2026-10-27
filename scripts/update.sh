#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v pm2 >/dev/null && [ -s "$HOME/.nvm/nvm.sh" ]; then
  set +u
  . "$HOME/.nvm/nvm.sh"
  set -u
fi

app_node="$(pm2 jlist | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const p=JSON.parse(s).find(p=>p.name==="yuuka");process.stdout.write(p?.pm2_env.exec_interpreter??"")})')"
if [ -x "$app_node" ]; then
  export PATH="$(dirname "$app_node"):$PATH"
fi
echo "Node: $(node -v)"

echo "=== Yuuka 更新スクリプト ==="

git pull
yarn install

yarn build

pm2 reload yuuka 2>/dev/null || pm2 start dist/index.js --name yuuka
pm2 flush yuuka

timeout 15 pm2 logs yuuka --lines 0 || true

echo "=== 更新完了 ==="
