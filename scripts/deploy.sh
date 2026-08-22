#!/bin/sh
# 本番デプロイスクリプト（データ保持型）
#
# 使用方法: ./scripts/deploy.sh
#
# このスクリプトは既存の DB・アップロードファイルを保持したまま再デプロイします。
# - `docker compose up --build` は named volume を消しません（データは残る）。
# - デプロイ前に必ず DB とアップロードのバックアップを取得します。
#   既存データがあるのにバックアップに失敗した場合はデプロイを中止します。
# - このスクリプトは `-v`（ボリューム削除）を絶対に使いません。
#
# 環境変数:
#   SKIP_BACKUP=1   バックアップをスキップ（非常時のみ。非推奨）
#   KEEP_BACKUPS=N  保持するバックアップ世代数（既定: 10）

set -e

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
BACKUP_DIR="db/backups"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
TS="$(date +%Y%m%d-%H%M%S)"

echo "=== Fast-API-LMS 本番デプロイ（データ保持型）==="

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
[ "$FOUND" -eq 0 ] && echo "[OK] CHANGE_ME なし"

# --- DB 接続情報を読み込み ---
# shellcheck disable=SC1091
. ./db/.env
PGUSER="${POSTGRES_USER:-postgres}"
PGDB="${POSTGRES_DB:-lms}"

# --- 既存データの有無を判定し、あればバックアップ ---
echo ""
echo "=== バックアップ ==="

# postgres-data ボリュームが存在するか（= 過去にデプロイ済み）
DB_VOLUME="$(docker volume ls --format '{{.Name}}' | grep -E '_postgres-data$' | head -1 || true)"

if [ -z "$DB_VOLUME" ]; then
    echo "[INFO] DB ボリュームが存在しません（初回デプロイ）。バックアップはスキップします。"
elif [ "$SKIP_BACKUP" = "1" ]; then
    echo "[WARN] SKIP_BACKUP=1 が指定されています。バックアップせずに続行します（非推奨）。"
else
    mkdir -p "$BACKUP_DIR"

    # DB を起動（既に起動中なら何もしない）。この時点では他サービスは触らない。
    echo "→ DB を起動して稼働を確認..."
    $COMPOSE up -d db >/dev/null

    # healthy になるまで待機（最大 60 秒）
    i=0
    while [ "$i" -lt 20 ]; do
        status="$(docker inspect --format='{{.State.Health.Status}}' lms-db 2>/dev/null || echo starting)"
        [ "$status" = "healthy" ] && break
        i=$((i + 1))
        sleep 3
    done
    if [ "$status" != "healthy" ]; then
        echo "[ERROR] DB が healthy になりませんでした。安全のためデプロイを中止します。"
        exit 1
    fi

    # 実データが入っているか確認（users テーブルが無い/空なら実質空とみなす）
    ROWS="$($COMPOSE exec -T db psql -U "$PGUSER" -d "$PGDB" -tAc \
        "SELECT COALESCE((SELECT count(*) FROM users), 0)" 2>/dev/null | tr -d '[:space:]' || echo 0)"
    [ -z "$ROWS" ] && ROWS=0

    if [ "$ROWS" = "0" ]; then
        echo "[INFO] DB は空です（users 0 件）。バックアップはスキップします。"
    else
        echo "→ DB をダンプ中（users ${ROWS} 件）..."
        DB_BACKUP="$BACKUP_DIR/db-$TS.sql.gz"
        DB_TMP="$BACKUP_DIR/db-$TS.sql.tmp"
        # pg_dump をパイプで gzip に繋ぐと、pg_dump が失敗しても pipeline の終了コードは
        # gzip のものになり失敗を見逃す（gzip は空入力でも成功する）。
        # そのため一旦生ファイルへ出力し、終了コードと内容を検証してから圧縮する。
        if ! $COMPOSE exec -T db pg_dump -U "$PGUSER" -d "$PGDB" > "$DB_TMP"; then
            echo "[ERROR] DB バックアップ（pg_dump）に失敗しました。デプロイを中止します。"
            rm -f "$DB_TMP"
            exit 1
        fi
        # pg_dump は必ずヘッダコメント 'PostgreSQL database dump' を出力する。
        # これが無い＝出力が壊れている/空とみなして中止する。
        if ! grep -q "PostgreSQL database dump" "$DB_TMP"; then
            echo "[ERROR] DB バックアップの内容が不正です（ヘッダ無し）。デプロイを中止します。"
            rm -f "$DB_TMP"
            exit 1
        fi
        gzip "$DB_TMP" && mv "$DB_TMP.gz" "$DB_BACKUP"
        echo "[OK] DB バックアップ: $DB_BACKUP ($(du -h "$DB_BACKUP" | cut -f1))"

        # アップロードファイル（提出物・画像）もバックアップ
        UP_VOLUME="$(docker volume ls --format '{{.Name}}' | grep -E '_uploads-data$' | head -1 || true)"
        if [ -n "$UP_VOLUME" ]; then
            echo "→ アップロードファイルをバックアップ中..."
            UP_BACKUP="$BACKUP_DIR/uploads-$TS.tar.gz"
            if docker run --rm -v "$UP_VOLUME":/data:ro -v "$(pwd)/$BACKUP_DIR":/backup alpine \
                sh -c "tar czf /backup/uploads-$TS.tar.gz -C /data . 2>/dev/null"; then
                echo "[OK] アップロード バックアップ: $UP_BACKUP ($(du -h "$UP_BACKUP" | cut -f1))"
            else
                echo "[WARN] アップロードのバックアップに失敗しました（DB は取得済み）。続行します。"
            fi
        fi

        # 古いバックアップを間引く（DB / uploads それぞれ最新 KEEP_BACKUPS 世代を残す）
        for prefix in db uploads; do
            ls -1t "$BACKUP_DIR/$prefix-"*.* 2>/dev/null | tail -n +"$((KEEP_BACKUPS + 1))" | while read -r old; do
                rm -f "$old"
            done
        done
    fi
fi

# --- ネットワーク帯域の変更が未適用でないか確認 ---
# docker-compose.prod.yml で default ネットワークのサブネットを固定しているが、
# Docker はネットワーク作成時にしか IPAM を読まないため、既存ネットワークがあると
# `up` では反映されない。ズレを検知したら操作者に手動 `down`（-v なし）を促す。
DESIRED_SUBNET="10.200.0.0/24"
NET_NAME="$(docker network ls --format '{{.Name}}' | grep -iE 'fast.?api.?lms.?react_default' | head -1 || true)"
if [ -n "$NET_NAME" ]; then
    CURRENT_SUBNET="$(docker network inspect "$NET_NAME" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
    if [ -n "$CURRENT_SUBNET" ] && [ "$CURRENT_SUBNET" != "$DESIRED_SUBNET" ]; then
        echo ""
        echo "[WARN] Docker ネットワークのサブネットが想定と異なります。"
        echo "       現在: $CURRENT_SUBNET / 想定: $DESIRED_SUBNET"
        echo "       反映するにはコンテナとネットワークの作り直しが必要です。"
        echo "       データは named volume に残るため、次を実行してください（-v は付けないこと）:"
        echo "         $COMPOSE down    # ← -v を付けるとデータが消えます。絶対に付けない"
        echo "         ./scripts/deploy.sh"
        echo "       （このまま続行しても既存サブネットのまま起動します）"
    fi
fi

# --- ビルドして起動（-v は使わない = データ保持）---
echo ""
echo "=== Docker イメージをビルドして起動 ==="
$COMPOSE up --build -d

echo ""
echo "=== 起動状態確認 ==="
$COMPOSE ps

echo ""
echo "=== デプロイ完了 ==="
echo "アクセス URL: http://$(hostname -I | awk '{print $1}'):4000"
if [ -n "$DB_VOLUME" ] && [ "${ROWS:-0}" != "0" ] && [ "$SKIP_BACKUP" != "1" ]; then
    echo ""
    echo "バックアップ: $BACKUP_DIR/  （最新 $KEEP_BACKUPS 世代を保持）"
    echo "DB を復元する場合:"
    echo "  gunzip -c $BACKUP_DIR/db-$TS.sql.gz | $COMPOSE exec -T db psql -U $PGUSER -d $PGDB"
fi
