# ---- 依存関係インストール ----
FROM node:22-alpine AS deps
WORKDIR /app
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ENV HTTP_PROXY=${HTTP_PROXY}
ENV HTTPS_PROXY=${HTTPS_PROXY}
ENV http_proxy=${http_proxy}
ENV https_proxy=${https_proxy}
COPY server/package*.json ./
RUN npm ci --no-audit

# ---- ビルド ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/ .
# NEXT_PUBLIC_* はビルド時にバンドルへ焼き込まれる。値は ARG で渡す（.env はイメージに入れない: frontend/.dockerignore）。
#   - 本番: docker-compose.prod.yml の build.args。値は `docker compose --env-file frontend/server/.env ...`
#     （scripts/deploy.sh が付ける）で frontend/server/.env から読まれる
#   - ARG の値が変わると、ここから先のビルドキャッシュが無効になり、確実に再ビルドされる
# コードで新しい NEXT_PUBLIC_* を使ったら、ここと docker-compose.prod.yml の args に追加すること
# （scripts/tests/check_public_env.py が検査する）
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_APP_BASE_URL
ARG NEXT_PUBLIC_MAINTENANCE_MODE
ARG NEXT_PUBLIC_DEBUG_LEVEL
ARG NEXT_PUBLIC_DISABLE_AUTH_CHECK
ARG NEXTAUTH_URL
# 本番ビルドでは 1 を渡す。必須の値が空なら、壊れた画面を作る前にビルドを失敗させる
ARG REQUIRE_PUBLIC_ENV
RUN if [ -n "$REQUIRE_PUBLIC_ENV" ] && { [ -z "$NEXT_PUBLIC_API_BASE_URL" ] || [ -z "$NEXT_PUBLIC_APP_BASE_URL" ]; }; then \
      echo "[ERROR] NEXT_PUBLIC_API_BASE_URL / NEXT_PUBLIC_APP_BASE_URL が空です。" >&2; \
      echo "        frontend/server/.env の値が渡されていません。scripts/deploy.sh を使うか、" >&2; \
      echo "        docker compose に --env-file frontend/server/.env を付けてください。" >&2; \
      exit 1; \
    fi
RUN npm run build

# ---- 実行 ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next.js スタンドアロン出力を使用
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# ポート 3000 を公開（docker-compose と一致）
EXPOSE 3000

# 本番サーバーで起動
CMD ["node", "server.js"]