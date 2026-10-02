#!/bin/sh
# 定期バックアップ（backup コンテナの中で動く）。
#
# 目的: コンテナやボリュームを誤って消しても、データが残っているようにする。
#   - DB（pg_dump）を数時間ごとに、アップロード（提出物・画像）を1日ごとに、ホストのディレクトリ（/backups = ./db/backups）へ保存する。
#   - 保存先は Docker のボリュームの外（ホストのディレクトリ）。`docker compose down -v` や `docker volume rm` でも消えない。
#   - 起動直後（= デプロイのたび）にも1回取る。
#
# 使い方:
#   lms-backup                 # 常駐（既定）。取る → 待つ → 取る … を繰り返す
#   lms-backup --once          # 1回だけ取って終わる（手動実行・テスト用）
#   lms-backup --healthcheck   # 直近のバックアップが新しければ 0（compose の healthcheck 用）
#
# 環境変数（既定値）:
#   PGHOST=db  POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB   接続先（db/.env の値）
#   BACKUP_INTERVAL_HOURS=4          DB を取る間隔（BACKUP_INTERVAL_SECONDS があればそちらを優先。テスト用）
#   BACKUP_UPLOADS_INTERVAL_HOURS=24 アップロードを取る間隔
#   BACKUP_KEEP_RECENT=24            直近これだけの個数は全部残す（4時間ごとなら4日分）
#   BACKUP_KEEP_DAILY_DAYS=30        それより古いものは「1日1個」を、この日数まで残す
#   BACKUP_KEEP_UPLOADS=7            アップロードのバックアップを残す個数
#   BACKUP_DB_WAIT_TRIES=24          DB の起動を待つ回数（5秒ごと。既定で最大約2分。テスト用に短くできる）
#
# 安全のための決まり:
#   - 新しいバックアップが検証を通るまで、古いものは消さない（失敗しても、あるものは残る）
#   - users が 0 件のDB（空のDBに作り直された等）は、バックアップしない・古いものも消さない
#     （空のバックアップで、正常なバックアップが押し出されるのを防ぐ）
#   - 取れたファイルは、ホスト側の /backups の所有者の持ち物（権限 600）にする（ホストのユーザーが復元に使えるように）
set -u

BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOADS_DIR="${UPLOADS_DIR:-/data/uploads}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-4}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-$((INTERVAL_HOURS * 3600))}"
UPLOADS_INTERVAL_HOURS="${BACKUP_UPLOADS_INTERVAL_HOURS:-24}"
KEEP_RECENT="${BACKUP_KEEP_RECENT:-24}"
KEEP_DAILY_DAYS="${BACKUP_KEEP_DAILY_DAYS:-30}"
KEEP_UPLOADS="${BACKUP_KEEP_UPLOADS:-7}"
DB_WAIT_TRIES="${BACKUP_DB_WAIT_TRIES:-24}"

export PGHOST="${PGHOST:-db}"
export PGUSER="${POSTGRES_USER:-postgres}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
export PGDATABASE="${POSTGRES_DB:-${POSTGRES_USER:-postgres}}"

umask 077
STARTED_MARK="/tmp/lms-backup-started"
STATUS_FILE="$BACKUP_DIR/.periodic-status"

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S')Z] $*"; }

# ---- ヘルスチェック: 直近の DB バックアップが新しいか ----
healthcheck() {
    newest="$(ls -1t "$BACKUP_DIR"/periodic-db-*.sql.gz 2>/dev/null | head -1)"
    # 許容: 間隔の2倍 + 30分
    limit_min=$(( (INTERVAL_SECONDS * 2) / 60 + 30 ))
    if [ -n "$newest" ] && [ -n "$(find "$newest" -mmin "-$limit_min" 2>/dev/null)" ]; then
        exit 0
    fi
    # まだ1つも取れていなくても、起動から30分以内なら待つ（DB の起動待ちなど）
    if [ -z "$newest" ] && [ -f "$STARTED_MARK" ] && [ -n "$(find "$STARTED_MARK" -mmin -30 2>/dev/null)" ]; then
        exit 0
    fi
    echo "直近の DB バックアップが ${limit_min} 分より古い、または無い: ${newest:-なし}" >&2
    exit 1
}

if [ "${1:-}" = "--healthcheck" ]; then
    healthcheck
fi

# ---- 共通 ----
# 取れたファイルを、ホスト側のディレクトリの所有者の持ち物にする（コンテナは root で動くため）
fix_owner() {
    owner="$(stat -c '%u:%g' "$BACKUP_DIR" 2>/dev/null || echo '')"
    [ -n "$owner" ] && chown "$owner" "$1" 2>/dev/null
    chmod 600 "$1" 2>/dev/null
    return 0
}

write_status() {
    {
        echo "updated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        echo "db=${LAST_DB_RESULT:-unknown}"
        echo "uploads=${LAST_UPLOADS_RESULT:-unknown}"
    } > "$STATUS_FILE.tmp" 2>/dev/null && mv "$STATUS_FILE.tmp" "$STATUS_FILE" 2>/dev/null
    fix_owner "$STATUS_FILE"
    return 0
}

# 日付（YYYYMMDD）を、ファイル名 periodic-xxx-YYYYMMDD-HHMMSS.* から取り出す
file_day() { echo "$1" | sed -E 's/.*-([0-9]{8})-[0-9]{6}\..*/\1/'; }

# 世代管理: 新しい順に、直近 KEEP_RECENT 個は全部残す。それより古いものは「1日1個（その日の最新）」を KEEP_DAILY_DAYS 日分だけ残す。
rotate_db() {
    cutoff="$(date -u -d "@$(( $(date +%s) - KEEP_DAILY_DAYS * 86400 ))" +%Y%m%d 2>/dev/null || echo 00000000)"
    i=0
    last_day=""
    for f in $(ls -1 "$BACKUP_DIR"/periodic-db-*.sql.gz 2>/dev/null | sort -r); do
        i=$((i + 1))
        [ "$i" -le "$KEEP_RECENT" ] && continue
        d="$(file_day "$f")"
        if [ "$d" != "$last_day" ] && [ "$d" -ge "$cutoff" ] 2>/dev/null; then
            last_day="$d"   # この日の最新を残す
        else
            rm -f "$f"
        fi
    done
}

rotate_uploads() {
    ls -1t "$BACKUP_DIR"/periodic-uploads-*.tar.gz 2>/dev/null | tail -n +"$((KEEP_UPLOADS + 1))" | while read -r old; do rm -f "$old"; done
}

# ---- DB ----
backup_db() {
    ts="$(date -u +%Y%m%d-%H%M%S)"
    tmp="$BACKUP_DIR/.periodic-db-$ts.sql.tmp"
    final="$BACKUP_DIR/periodic-db-$ts.sql.gz"
    trap 'rm -f "$tmp" "$tmp.gz"' EXIT

    n=0
    until pg_isready -q -t 5; do
        n=$((n + 1))
        if [ "$n" -ge "$DB_WAIT_TRIES" ]; then LAST_DB_RESULT="error: DB に接続できない"; log "[ERROR] DB に接続できません（$PGHOST）"; return 1; fi
        sleep 5
    done

    if ! pg_dump --clean --if-exists > "$tmp" 2> "$tmp.err"; then
        LAST_DB_RESULT="error: pg_dump 失敗"; log "[ERROR] pg_dump に失敗しました: $(tr '\n' ' ' < "$tmp.err" | cut -c1-200)"; rm -f "$tmp" "$tmp.err"; return 1
    fi
    rm -f "$tmp.err"
    if ! grep -q "PostgreSQL database dump" "$tmp" || ! grep -q "PostgreSQL database dump complete" "$tmp"; then
        LAST_DB_RESULT="error: ダンプが不正"; log "[ERROR] ダンプの内容が不正です（ヘッダまたは終端が無い）"; rm -f "$tmp"; return 1
    fi
    if ! grep -q "CREATE TABLE public.users" "$tmp"; then
        LAST_DB_RESULT="error: users テーブルが無い"; log "[ERROR] ダンプに users テーブルがありません（空のDB・別のDBの可能性）。バックアップせず、古いものも消しません"; rm -f "$tmp"; return 1
    fi
    users="$(psql -tAc 'SELECT count(*) FROM public.users' 2>/dev/null | tr -d '[:space:]')"
    case "$users" in
        ''|*[!0-9]*) LAST_DB_RESULT="error: users 件数を取得できない"; log "[ERROR] users の件数を確認できません"; rm -f "$tmp"; return 1 ;;
    esac
    if [ "$users" = "0" ]; then
        LAST_DB_RESULT="error: users が 0 件"; log "[ERROR] users が 0 件です。空のDBに作り直された可能性があります。バックアップせず、古いものも消しません"; rm -f "$tmp"; return 1
    fi
    if ! gzip "$tmp" || ! gzip -t "$tmp.gz"; then
        LAST_DB_RESULT="error: 圧縮に失敗"; log "[ERROR] 圧縮に失敗しました"; rm -f "$tmp" "$tmp.gz"; return 1
    fi
    mv "$tmp.gz" "$final" && fix_owner "$final"
    trap - EXIT
    LAST_DB_RESULT="ok: $(basename "$final") users=${users}"
    log "[OK] DB: $final ($(du -h "$final" | cut -f1), users ${users} 件)"
    rotate_db
    return 0
}

# ---- アップロード ----
uploads_due() {
    newest="$(ls -1t "$BACKUP_DIR"/periodic-uploads-*.tar.gz 2>/dev/null | head -1)"
    [ -z "$newest" ] && return 0
    [ -z "$(find "$newest" -mmin "-$((UPLOADS_INTERVAL_HOURS * 60))" 2>/dev/null)" ]
}

backup_uploads() {
    if [ ! -d "$UPLOADS_DIR" ]; then
        LAST_UPLOADS_RESULT="skipped: $UPLOADS_DIR が無い"; log "[WARN] $UPLOADS_DIR が無いので、アップロードのバックアップをスキップします"; return 0
    fi
    ts="$(date -u +%Y%m%d-%H%M%S)"
    tmp="$BACKUP_DIR/.periodic-uploads-$ts.tar.gz.tmp"
    final="$BACKUP_DIR/periodic-uploads-$ts.tar.gz"
    if ! tar czf "$tmp" -C "$UPLOADS_DIR" . 2>/dev/null || ! tar tzf "$tmp" >/dev/null 2>&1; then
        LAST_UPLOADS_RESULT="error: tar 失敗"; log "[ERROR] アップロードのバックアップに失敗しました"; rm -f "$tmp"; return 1
    fi
    mv "$tmp" "$final" && fix_owner "$final"
    LAST_UPLOADS_RESULT="ok: $(basename "$final")"
    log "[OK] アップロード: $final ($(du -h "$final" | cut -f1))"
    rotate_uploads
    return 0
}

cycle() {
    rc=0
    backup_db || rc=1
    if uploads_due; then backup_uploads || rc=1; fi
    write_status
    return "$rc"
}

mkdir -p "$BACKUP_DIR"
: > "$STARTED_MARK"

if [ "${1:-}" = "--once" ]; then
    cycle
    exit $?
fi

log "定期バックアップを開始します（DB: ${INTERVAL_SECONDS} 秒ごと、アップロード: ${UPLOADS_INTERVAL_HOURS} 時間ごと、保存先: $BACKUP_DIR）"
trap 'log "停止します"; exit 0' TERM INT
while true; do
    cycle || log "[WARN] このサイクルは失敗しました。次の周期で再試行します"
    sleep "$INTERVAL_SECONDS" &
    wait $!
done
