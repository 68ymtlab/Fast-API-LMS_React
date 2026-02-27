#!/bin/sh
# 本番デプロイスクリプト
# 使用方法: ./scripts/deploy.sh

set -e

echo "=== Fast-API-LMS 本番デプロイ ==="

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

# --- CHANGE_ME が残っていないか簡易チェック ---
echo ""
echo "=== CHANGE_ME チェック ==="
FOUND=0
for f in backend/.env frontend/server/.env db/.env; do
    if grep -q "CHANGE_ME" "$f" 2>/dev/null; then
        echo "[WARN] $f に CHANGE_ME が含まれています。本番値に変更してください。"
        FOUND=1
    fi
done
if [ "$FOUND" -eq 0 ]; then
    echo "[OK] CHANGE_ME なし"
fi

echo ""
echo "=== Docker イメージをビルドして起動 ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

echo ""
echo "=== 起動状態確認 ==="
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

echo ""
echo "=== デプロイ完了 ==="
echo "アクセス URL: http://\$(hostname -I | awk '{print \$1}'):8080"
