#!/bin/bash
set -e  # エラーが出たら即終了

echo "=== 🧹 LMS DB Reset Script (Linux/macOS) ==="

# プロジェクトルートを基準に移動（scripts の1階層上）
cd "$(dirname "$0")/.."

# 1. サービスを停止・ボリューム削除（完全リセット）
echo "→ Stopping containers and removing volumes..."
docker compose down -v --remove-orphans

# 2. 再構築
echo "→ Starting containers..."
ENV_FILE=./db/.env
[ -f "$ENV_FILE" ] || ENV_FILE=./db/.env.example
docker compose --env-file "$ENV_FILE" up -d

# 3. lms-db のヘルスチェックを待機
echo "⏳ Waiting for 'lms-db' to become healthy..."
while true; do
  status=$(docker inspect --format='{{.State.Health.Status}}' lms-db 2>/dev/null || echo "starting")
  if [ "$status" == "healthy" ]; then
    echo "✅ lms-db is healthy!"
    break
  fi
  sleep 3
done

echo "✅ Reset complete! All services are running fresh."
