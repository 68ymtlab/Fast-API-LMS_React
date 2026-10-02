#!/bin/sh
# バックアップの復元テスト（「取れているバックアップが本当に使えるか」を自動で確かめる）
#
# 使い方:
#   ./scripts/restore_test.sh                       # 最新のバックアップで検証
#   ./scripts/restore_test.sh db/backups/xxx.sql.gz # 指定したファイルで検証
#
# やること:
#   使い捨ての PostgreSQL コンテナ（外部に公開せず、終了時に必ず削除）を起動し、
#   そこへバックアップを復元して、中身（テーブル数・users 件数）を確認する。
#   本番の DB には一切書き込まない（稼働中DBは件数の比較のために読み取るだけ）。
#
# 環境変数:
#   DB_CONTAINER=名前   比較対象の稼働中DBコンテナ（既定 lms-db）
#   BACKUP_DIR=パス     バックアップの場所（既定 db/backups）
#
# 終了コード 0 = 復元できて中身も妥当 / 0以外 = 問題あり

set -eu

cd "$(dirname "$0")/.."

DB_CONTAINER="${DB_CONTAINER:-lms-db}"
BACKUP_DIR="${BACKUP_DIR:-db/backups}"
TEST_CONTAINER="lms-restore-test-$$"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

cleanup() {
    docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --- 検証するファイルを決める ---
FILE="${1:-}"
if [ -z "$FILE" ]; then
    # 定期バックアップ（periodic-）・cron（auto-）・デプロイ前（db-）・消す直前（pre-destroy-）のうち、一番新しいもの
    FILE="$(ls -1t "$BACKUP_DIR"/periodic-db-*.sql.gz "$BACKUP_DIR"/auto-db-*.sql.gz "$BACKUP_DIR"/db-*.sql.gz "$BACKUP_DIR"/pre-destroy-db-*.sql.gz 2>/dev/null | head -1 || true)"
fi
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
    log "[ERROR] 検証するバックアップが見つかりません（${FILE:-$BACKUP_DIR 内に無し}）。"
    exit 1
fi
log "検証対象: $FILE ($(du -h "$FILE" | cut -f1))"

if ! gzip -t "$FILE"; then
    log "[ERROR] gzip として壊れています。"
    exit 1
fi

# --- 使い捨てDBを起動（本番と同じイメージ）---
IMAGE="$(docker inspect --format '{{.Config.Image}}' "$DB_CONTAINER" 2>/dev/null || true)"
IMAGE="${IMAGE:-postgres:16-alpine}"
log "使い捨てDBを起動: $IMAGE"
docker run -d --name "$TEST_CONTAINER" --network none \
    -e POSTGRES_PASSWORD=restore_test -e POSTGRES_DB=restore_check \
    "$IMAGE" >/dev/null

# 初期化中の一時サーバと本起動の2回「ready」が出る。2回目まで待つ
i=0
while [ "$i" -lt 60 ]; do
    READY="$(docker logs "$TEST_CONTAINER" 2>&1 | grep -c "ready to accept connections" || true)"
    [ "$READY" -ge 2 ] && break
    i=$((i + 1))
    sleep 1
done
if [ "$READY" -lt 2 ]; then
    log "[ERROR] 使い捨てDBが起動しませんでした。"
    docker logs "$TEST_CONTAINER" 2>&1 | tail -5
    exit 1
fi

PSQL="docker exec -i $TEST_CONTAINER psql -U postgres -d restore_check"

# ダンプはテーブルの所有者として tutor_app を参照するので、ロールだけ用意しておく
$PSQL -qc "CREATE ROLE tutor_app" >/dev/null

# --- 復元 ---
log "復元中..."
if ! gunzip -c "$FILE" | $PSQL -q -v ON_ERROR_STOP=1 >/dev/null; then
    log "[ERROR] 復元に失敗しました。このバックアップは使えません。"
    exit 1
fi

# --- 中身の確認 ---
TABLES="$($PSQL -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('public','tutor')" | tr -d '[:space:]')"
USERS="$($PSQL -tAc "SELECT count(*) FROM public.users" | tr -d '[:space:]')"
log "復元結果: テーブル ${TABLES} 個 / users ${USERS} 件"

if [ "${TABLES:-0}" -eq 0 ]; then
    log "[ERROR] テーブルが1つも復元されていません。"
    exit 1
fi
if [ "${USERS:-0}" -eq 0 ]; then
    log "[ERROR] users が 0 件です。空のDBのバックアップの可能性があります。"
    exit 1
fi

# 稼働中のDBと比べる（バックアップ後に増えた分は差が出て当然なので、減っている場合だけ警告）
LIVE="$(docker exec "$DB_CONTAINER" sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -tAc "SELECT count(*) FROM public.users"' 2>/dev/null | tr -d '[:space:]' || true)"
case "$LIVE" in
    ''|*[!0-9]*)
        log "[INFO] 稼働中DBの users 件数は取得できませんでした（比較はスキップ）。"
        ;;
    *)
        if [ "$USERS" -lt "$LIVE" ]; then
            log "[WARN] 稼働中DBは users ${LIVE} 件。バックアップ後に増えた分、または削除・差異があります。"
        else
            log "[INFO] 稼働中DBの users は ${LIVE} 件（バックアップ以上で整合）。"
        fi
        ;;
esac

log "[OK] 復元テスト成功"
