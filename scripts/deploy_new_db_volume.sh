#!/bin/sh
# 新しいDBボリュームで本番スタックを再デプロイするスクリプト
# 使用方法:
#   ./scripts/deploy_new_db_volume.sh
#   ./scripts/deploy_new_db_volume.sh my-db-volume-name

set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

DB_VOLUME_NAME="${1:-postgres-data-$(date +%Y%m%d%H%M%S)}"
TMP_OVERRIDE_FILE="$(mktemp /tmp/docker-compose.db-volume-XXXXXX.yml)"

cleanup() {
  rm -f "$TMP_OVERRIDE_FILE"
}
trap cleanup EXIT

echo "=== Fast-API-LMS 新DBボリューム再デプロイ ==="
echo "DB volume: $DB_VOLUME_NAME"

# --- .env ファイルの存在確認 ---
MISSING=0

check_env() {
    if [ ! -f "$1" ]; then
        echo "[ERROR] $1 が存在しません。"
        echo "        $2 をコピーして作成してください:"
        echo "        cp $2 $1"
        MISSING=1
    else
        echo "[OK]    $1"
    fi
}

check_env "backend/.env"           "backend/.env.prod.example"
check_env "frontend/server/.env"   "frontend/server/.env.prod.example"
check_env "db/.env"                "db/.env.prod.example"

if [ "$MISSING" -ne 0 ]; then
    echo ""
    echo "上記の .env ファイルを作成してから再実行してください。"
    exit 1
fi

# DB のデータ保存先のみ新しいボリュームへ切り替える override を一時生成
cat > "$TMP_OVERRIDE_FILE" <<EOF
services:
  db:
    volumes:
      - ./db/init/01-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./db/init/02-progress-migration.sql:/docker-entrypoint-initdb.d/02-progress-migration.sql:ro
      - ./db/init/03-students-columns-migration.sql:/docker-entrypoint-initdb.d/03-students-columns-migration.sql:ro
      - ./db/init/02-assignments.sql:/docker-entrypoint-initdb.d/04-assignments.sql:ro
      - ./db/init/05-soft-delete-email-migration.sql:/docker-entrypoint-initdb.d/05-soft-delete-email-migration.sql:ro
      - ${DB_VOLUME_NAME}:/var/lib/postgresql/data

volumes:
  ${DB_VOLUME_NAME}:
EOF

echo ""
echo "=== 既存スタック停止 ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

echo ""
echo "=== 新DBボリュームで起動 ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f "$TMP_OVERRIDE_FILE" up --build -d

echo ""
echo "=== 起動状態確認 ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f "$TMP_OVERRIDE_FILE" ps

echo ""
echo "=== 完了 ==="
echo "新しいDBボリューム: $DB_VOLUME_NAME"
echo "古いボリュームは削除されていません。不要なら docker volume rm で削除してください。"
