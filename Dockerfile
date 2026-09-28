# Brick Talk 的 Docker 版。只提供 Dockerfile 讓你在自己的電腦 build：
# 映像檔裡的 Claude Code 是 Anthropic 的專有授權軟體，不要把 build 好的映像檔推到公開的 registry。

# ---------- build ----------
FROM node:26-bookworm-slim AS build
# Node 25 起不再內建 corepack，直接裝 package.json 指定的 pnpm 版本
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY . .
# postinstall 會從 price.default.json 建立價格表
RUN pnpm install --frozen-lockfile \
 && pnpm build \
 && pnpm prune --prod --ignore-scripts

# ---------- runtime ----------
FROM node:26-bookworm-slim
# Claude Code CLI：沒有 API key、用 Claude 訂閱（CLAUDE_CODE_OAUTH_TOKEN）時用它設計。版本固定，每次 build 的結果才一樣
ARG CLAUDE_CODE_VERSION=2.1.283
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates \
 && apt-get clean \
 && npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force

WORKDIR /app
COPY --from=build --chown=node:node /app ./
# 零件資料庫與 Rebrickable 原始資料放在 /data（docker compose 掛 volume），重啟不用重新下載
RUN mkdir -p /data && chown node:node /data \
 && ln -s /data/rebrickable data/raw/rebrickable \
 && chmod +x docker/entrypoint.sh

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DISABLE_AUTOUPDATER=1 \
    CATALOG_DB_PATH=/data/lego_catalog.sqlite
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker/entrypoint.sh"]
