#!/bin/bash
set -e  # エラーが出たら即終了

echo "=== 🧹 Supabase Test Reset Script (Linux/macOS) ==="

# プロジェクトルートを基準に移動（scripts の1階層上）
cd "$(dirname "$0")/.."

# 1. サービスを停止・削除
echo "→ Stopping and removing containers..."
docker compose -p supabase-test down --remove-orphans

# 2. ボリュームを削除
echo "→ Removing volume: supabase-test_db-config..."
docker volume rm supabase-test_db-config || true

# 3. データディレクトリを再作成
if [ -d ./volumes/db/init/data ]; then
  echo "→ Removing local Postgres data directory..."
  rm -rf ./volumes/db/init/data
fi
mkdir -p ./volumes/db/init/data

# 4. 再構築
echo "→ Starting containers..."
docker compose --env-file ./db/.env.example up -d

# 5. supabase-db のヘルスチェックを待機 -> .gitkeep 復元のタイミング確保
echo "⏳ Waiting for 'supabase-db' to become healthy..."
while true; do
  status=$(docker inspect --format='{{.State.Health.Status}}' supabase-db 2>/dev/null || echo "starting")
  if [ "$status" == "healthy" ]; then
    echo "✅ supabase-db is healthy!"
    break
  fi
  sleep 3
done

touch ./volumes/db/init/data/.gitkeep

echo "✅ Reset complete! All services are running fresh."
