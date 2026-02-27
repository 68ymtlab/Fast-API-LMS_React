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
# ビルド時に必要な環境変数（ARGで渡す）
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_APP_BASE_URL
ARG NEXTAUTH_URL
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