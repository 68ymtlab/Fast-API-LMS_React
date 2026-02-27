#!/bin/sh
# seed_users 実行スクリプト
# 使用方法:
#   ./scripts/seed_users.sh        # prod 構成 (default)
#   ./scripts/seed_users.sh prod
#   ./scripts/seed_users.sh dev

set -e

cd "$(dirname "$0")/.."

MODE="${1:-prod}"

case "$MODE" in
  prod)
    COMPOSE_ARGS="-f docker-compose.yml -f docker-compose.prod.yml"
    ;;
  dev)
    COMPOSE_ARGS="-f docker-compose.yml"
    ;;
  *)
    echo "[ERROR] 無効なモードです: $MODE"
    echo "        使用可能: prod | dev"
    exit 1
    ;;
esac

echo "=== seed_users 実行 ($MODE) ==="
echo "→ backend / db を起動確認中..."
# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS up -d db backend >/dev/null

echo "→ seed_users.py を実行中..."
# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS exec -T backend poetry run python scripts/seed_users.py

echo "✅ seed_users.py 実行完了"
