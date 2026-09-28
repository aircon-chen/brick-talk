#!/bin/sh
# 容器啟動：決定 AI 後端、第一次啟動時準備零件資料庫，最後啟動網站。
set -e

# 有 API key 就用 API key；沒有但有 Claude 訂閱的 token，就改走 Claude Code CLI
if [ -n "$ANTHROPIC_API_KEY" ]; then
  echo "[brick-talk] AI 設計：Anthropic API key"
elif [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
  export LLM_BACKEND=claude-cli
  echo "[brick-talk] AI 設計：Claude 訂閱（Claude Code CLI）"
else
  echo "[brick-talk] 沒有設定 ANTHROPIC_API_KEY 或 CLAUDE_CODE_OAUTH_TOKEN：可以看範例模型，「開始設計」會提示設定。"
fi

# 零件總覽頁的資料庫：第一次啟動時下載 Rebrickable 的資料並建立，之後沿用 volume 裡的檔案
if [ "${CATALOG_AUTO_BUILD:-1}" = "1" ] && [ ! -f "$CATALOG_DB_PATH" ]; then
  echo "[brick-talk] 第一次啟動，準備零件總覽頁的資料庫（下載約 17 MB）……"
  if python3 docker/build_catalog_db.py; then
    echo "[brick-talk] 零件資料庫完成"
  else
    echo "[brick-talk] 零件資料庫沒建成，零件總覽頁會顯示產生方式，其他功能照常。"
  fi
fi

echo "[brick-talk] 網站啟動：http://localhost:3000"
exec node_modules/.bin/next start -H 0.0.0.0 -p 3000
