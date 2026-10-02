#!/bin/sh
# 本番DBのスキーマ（public）が、リポジトリの db/init/*.sql から作ったスキーマと一致するか確認する。
#
# なぜ必要か:
#   db/init/*.sql は「空のDBの初回起動時」しか実行されない。本番DBが古いまま新しいコードをデプロイすると、
#   列やテーブルが無くて API が 500 になる。デプロイ前にこのスクリプトで差分を洗い出す。
#
# 使い方:
#   ./scripts/schema_diff.sh
#
# やること:
#   1) 使い捨ての PostgreSQL に db/init/*.sql を compose と同じ順序で流してスキーマを作る
#   2) 稼働中DB（読み取りのみ）と、スキーマだけをダンプして比較する
#   3) 差分を表示。終了コード 0 = 一致 / 1 = 差分あり / 2 = 実行エラー
#
# 環境変数:
#   DB_CONTAINER=名前  比較対象の稼働中DBコンテナ（既定 lms-db）
#
# 注意:
#   - 比較するのは public スキーマのみ。tutor スキーマは tutor サービスが起動時に作る。
#   - announcements / announcement_reads は API が実行時に自動作成するため比較から除外している。
#   - 列の並び順だけの違い（後から ALTER ADD COLUMN した列は末尾に付く）も差分として出る。
#     その場合は中身（列の有無・型・制約）を見て判断する。

set -eu

cd "$(dirname "$0")/.."

DB_CONTAINER="${DB_CONTAINER:-lms-db}"
REF_CONTAINER="lms-schema-ref-$$"
WORK="$(mktemp -d)"

cleanup() {
    docker rm -f "$REF_CONTAINER" >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

STATE="$(docker inspect --format '{{.State.Status}}' "$DB_CONTAINER" 2>/dev/null || true)"
if [ "${STATE:-}" != "running" ]; then
    log "[ERROR] $DB_CONTAINER が稼働していません（状態: ${STATE:-missing}）。"
    exit 2
fi

IMAGE="$(docker inspect --format '{{.Config.Image}}' "$DB_CONTAINER")"

# docker-compose.yml の db サービスと同じマウント（ファイル名＝実行順）で初期化する
log "基準スキーマを作成中（$IMAGE に db/init を適用）..."
docker run -d --name "$REF_CONTAINER" --network none \
    -e POSTGRES_PASSWORD=ref -e POSTGRES_DB=lms \
    -v "$(pwd)/db/init/01-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro" \
    -v "$(pwd)/db/init/02-progress-migration.sql:/docker-entrypoint-initdb.d/02-progress-migration.sql:ro" \
    -v "$(pwd)/db/init/03-students-columns-migration.sql:/docker-entrypoint-initdb.d/03-students-columns-migration.sql:ro" \
    -v "$(pwd)/db/init/02-assignments.sql:/docker-entrypoint-initdb.d/04-assignments.sql:ro" \
    -v "$(pwd)/db/init/05-soft-delete-email-migration.sql:/docker-entrypoint-initdb.d/05-soft-delete-email-migration.sql:ro" \
    "$IMAGE" >/dev/null

# 初期化中の一時サーバと本起動の2回「ready」が出る。2回目まで待つ
i=0
READY=0
while [ "$i" -lt 90 ]; do
    READY="$(docker logs "$REF_CONTAINER" 2>&1 | grep -c "ready to accept connections" || true)"
    [ "$READY" -ge 2 ] && break
    i=$((i + 1))
    sleep 1
done
if [ "$READY" -lt 2 ]; then
    log "[ERROR] 基準DBが起動しませんでした（db/init の SQL にエラーがある可能性）。"
    docker logs "$REF_CONTAINER" 2>&1 | grep -iE "error|fatal" | head -5
    exit 2
fi

# announcements 系のテーブルは db/init には無く、API（announcements_router.py）が最初のリクエスト時に
# CREATE TABLE IF NOT EXISTS で作る。差分に出ても問題ないので比較から除外する
EXCLUDE="-T public.announcements -T public.announcement_reads -T public.announcements_id_seq -T public.announcement_reads_id_seq"

# コメント行・pg_dump のバージョン依存の行を除いて、比較しやすい形にする
normalize() {
    grep -vE '^--|^\\(un)?restrict ' | cat -s
}

docker exec "$REF_CONTAINER" pg_dump -U postgres -d lms --schema-only --no-owner --no-privileges -n public $EXCLUDE \
    | normalize > "$WORK/expected.sql"
docker exec "$DB_CONTAINER" sh -c 'pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" --schema-only --no-owner --no-privileges -n public '"$EXCLUDE" \
    | normalize > "$WORK/actual.sql"

if [ ! -s "$WORK/expected.sql" ] || [ ! -s "$WORK/actual.sql" ]; then
    log "[ERROR] スキーマのダンプが空です。"
    exit 2
fi

if diff -u "$WORK/actual.sql" "$WORK/expected.sql" > "$WORK/diff.txt"; then
    log "[OK] $DB_CONTAINER の public スキーマは db/init から作ったスキーマと一致しています。"
    exit 0
fi

log "[DIFF] 差分があります。'-' が稼働中DB、'+' が db/init から作った基準です:"
echo ""
sed 's/^/    /' "$WORK/diff.txt"
echo ""
log "'+' の行（基準にあって稼働中DBに無い）は、デプロイ後にエラーになる可能性が高い項目です。"
exit 1
