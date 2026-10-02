#!/bin/sh
# 定期バックアップ（cron から実行する想定。手動でも実行できる）
#
# 使い方:
#   ./scripts/backup.sh
#
# やること:
#   1) 稼働中の DB コンテナから pg_dump し、内容を検証して db/backups/auto-db-<日時>.sql.gz に保存
#   2) アップロード（提出物・画像）を db/backups/auto-uploads-<日時>.tar.gz に保存
#   3) 古い auto-* を間引く（既定 14 世代）
#   4) BACKUP_REMOTE が設定されていれば、別マシンへコピー
#
# 環境変数:
#   KEEP_AUTO_BACKUPS=N   保持世代数（既定 14）
#   BACKUP_REMOTE=...     コピー先。rsync の書式（例: backup@host:/srv/lms-backups/）
#   DB_CONTAINER=名前     対象DBコンテナ（既定 lms-db）
#   BACKUP_DIR=パス       保存先（既定 db/backups）
#   BACKUP_PREFIX=名前    ファイル名の接頭辞（既定 auto。破壊的な操作の直前は pre-destroy。接頭辞ごとに世代管理される）
#
# deploy.sh が取る db-* / uploads-*（デプロイ前バックアップ）とは名前を分けてあり、
# お互いの世代管理で消し合わない。
#
# どこかが失敗すると終了コードが 0 以外になる（cron のメールやログで気付けるように）。

set -eu

# バックアップにはメールアドレスや学習ログなど個人情報が入る。作成するファイルは本人だけが読めるようにする
umask 077

cd "$(dirname "$0")/.."

DB_CONTAINER="${DB_CONTAINER:-lms-db}"
BACKUP_DIR="${BACKUP_DIR:-db/backups}"
KEEP="${KEEP_AUTO_BACKUPS:-14}"
PREFIX="${BACKUP_PREFIX:-auto}"
REMOTE="${BACKUP_REMOTE:-}"
TS="$(date +%Y%m%d-%H%M%S)"
FAILED=0

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

mkdir -p "$BACKUP_DIR"

# --- 前提: DB コンテナが稼働中 ---
STATE="$(docker inspect --format '{{.State.Status}}' "$DB_CONTAINER" 2>/dev/null || true)"
STATE="${STATE:-missing}"
if [ "$STATE" != "running" ]; then
    log "[ERROR] $DB_CONTAINER が稼働していません（状態: ${STATE}）。バックアップできません。"
    exit 1
fi

# --- 1) DB ---
DB_BACKUP="$BACKUP_DIR/${PREFIX}-db-$TS.sql.gz"
DB_TMP="$BACKUP_DIR/${PREFIX}-db-$TS.sql.tmp"
trap 'rm -f "$DB_TMP" "$DB_TMP.gz"' EXIT

log "DB をダンプ中..."
# 生ファイルに出力してから検証する（パイプで gzip に繋ぐと pg_dump の失敗を見逃すため）
if ! docker exec "$DB_CONTAINER" sh -c 'pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" --clean --if-exists' > "$DB_TMP"; then
    log "[ERROR] pg_dump に失敗しました。"
    exit 1
fi
if ! grep -q "PostgreSQL database dump" "$DB_TMP" || ! grep -q "PostgreSQL database dump complete" "$DB_TMP"; then
    log "[ERROR] ダンプの内容が不正です（ヘッダまたは終端が無い）。"
    exit 1
fi
# 本番の中身が入っているダンプか（空のDBを「成功」として保存してしまわないための確認）
if ! grep -q "CREATE TABLE public.users" "$DB_TMP"; then
    log "[ERROR] ダンプに users テーブルがありません。空のDBをバックアップしている可能性があります。"
    exit 1
fi
if ! gzip "$DB_TMP" || ! gzip -t "$DB_TMP.gz"; then
    log "[ERROR] 圧縮に失敗しました。"
    exit 1
fi
mv "$DB_TMP.gz" "$DB_BACKUP"
log "[OK] DB: $DB_BACKUP ($(du -h "$DB_BACKUP" | cut -f1))"

# --- 2) アップロード ---
# ボリューム名は DB コンテナの compose プロジェクト名から決まる（<project>_uploads-data）
PROJECT="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$DB_CONTAINER" 2>/dev/null || true)"
UP_VOLUME="${PROJECT}_uploads-data"
if [ -n "$PROJECT" ] && docker volume inspect "$UP_VOLUME" >/dev/null 2>&1; then
    UP_BACKUP="$BACKUP_DIR/${PREFIX}-uploads-$TS.tar.gz"
    log "アップロードをバックアップ中..."
    if docker run --rm -v "$UP_VOLUME":/data:ro -v "$(pwd)/$BACKUP_DIR":/backup alpine \
        sh -c "tar czf /backup/${PREFIX}-uploads-$TS.tar.gz -C /data ."; then
        log "[OK] アップロード: $UP_BACKUP ($(du -h "$UP_BACKUP" | cut -f1))"
    else
        log "[ERROR] アップロードのバックアップに失敗しました（DB は保存済み）。"
        rm -f "$UP_BACKUP"
        FAILED=1
    fi
else
    log "[WARN] アップロードのボリューム（${UP_VOLUME}）が見つからないためスキップします。"
fi

# --- 3) 世代管理（auto-db / auto-uploads それぞれ最新 KEEP 世代を残す）---
for prefix in "${PREFIX}-db" "${PREFIX}-uploads"; do
    ls -1t "$BACKUP_DIR/$prefix-"* 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
        rm -f "$old"
    done
done

# --- 4) 別マシンへコピー（任意）---
if [ -n "$REMOTE" ]; then
    log "別マシンへコピー中: $REMOTE"
    # --timeout: 相手が応答しないときに cron ジョブが居座り続けないようにする
    if rsync -a --timeout=120 --include="${PREFIX}-*" --exclude='*' "$BACKUP_DIR"/ "$REMOTE"; then
        log "[OK] コピー完了"
    else
        log "[ERROR] 別マシンへのコピーに失敗しました（ローカルのバックアップは残っています）。"
        FAILED=1
    fi
else
    log "[WARN] BACKUP_REMOTE が未設定です。バックアップがこのサーバー内にしかありません。"
fi

if [ "$FAILED" -ne 0 ]; then
    log "完了しましたが、一部が失敗しています。上のログを確認してください。"
    exit 1
fi
log "バックアップ完了"
