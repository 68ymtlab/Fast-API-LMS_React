#!/bin/sh
# backup コンテナ（backup/run.sh）のテスト（本物の docker と PostgreSQL を使う）。
#   - 取れる／検証する／ホスト側の所有者・権限になる／世代管理／失敗時に古いものを消さない／空のDBでは上書きしない／ヘルスチェック
# 使い捨てのコンテナ・ボリューム・ディレクトリだけを触る。本番・開発のものには触れない。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

SUF="$$"
NET="pbtest-net-$SUF"
PG="pbtest-pg-$SUF"
IMG="pbtest-img-$SUF"
UPVOL="pbtest-up-$SUF"
HOSTDIR="$(mktemp -d)"
chmod 700 "$HOSTDIR"

cleanup() {
    docker rm -f "$PG" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    docker volume rm "$UPVOL" >/dev/null 2>&1 || true
    docker rmi -f "$IMG" >/dev/null 2>&1 || true
    # コンテナ(root)が作ったファイルが残る場合があるので、コンテナ経由で消す
    docker run --rm -v "$HOSTDIR:/b" alpine sh -c 'rm -rf /b/* /b/.[!.]*' >/dev/null 2>&1 || true
    rm -rf "$HOSTDIR"
}
trap cleanup EXIT

docker build -q -t "$IMG" "$REPO/backup" >/dev/null || { fail "イメージをビルドできない"; finish; exit 1; }
docker network create "$NET" >/dev/null
INIT_MOUNTS="-v $REPO/db/init/01-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro \
-v $REPO/db/init/02-progress-migration.sql:/docker-entrypoint-initdb.d/02-progress-migration.sql:ro \
-v $REPO/db/init/03-students-columns-migration.sql:/docker-entrypoint-initdb.d/03-students-columns-migration.sql:ro \
-v $REPO/db/init/02-assignments.sql:/docker-entrypoint-initdb.d/04-assignments.sql:ro \
-v $REPO/db/init/05-soft-delete-email-migration.sql:/docker-entrypoint-initdb.d/05-soft-delete-email-migration.sql:ro"
# shellcheck disable=SC2086
docker run -d --name "$PG" --network "$NET" --network-alias db -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=lms $INIT_MOUNTS postgres:16-alpine >/dev/null
wait_pg_ready "$PG" || { fail "DB が起動しない"; finish; exit 1; }

docker volume create "$UPVOL" >/dev/null
docker run --rm -v "$UPVOL":/d alpine sh -c 'mkdir -p /d/images && echo hello > /d/images/a.txt'

# 以降、バックアップコンテナを --once で実行するヘルパ（環境変数は追加で渡せる）
run_backup() {
    docker run --rm --network "$NET" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=lms \
        -v "$HOSTDIR:/backups" -v "$UPVOL":/data/uploads:ro "$@" "$IMG" --once
}
psql_db() { docker exec "$PG" psql -U postgres -d lms -tAc "$1"; }

echo "- users が入っているDBを、ホストのディレクトリへバックアップする"
psql_db "INSERT INTO users (id, username, display_name, email, password_hash, role_id, is_disabled)
         SELECT g, 'u'||g, 'u'||g, 'u'||g||'@example.com', 'h', 1, false FROM generate_series(1,7) g" >/dev/null
out="$(run_backup 2>&1)"; rc=$?
assert_eq "終了コード" 0 "$rc"
DBFILE="$(ls -1t "$HOSTDIR"/periodic-db-*.sql.gz 2>/dev/null | head -1)"
[ -n "$DBFILE" ] && ok "periodic-db-*.sql.gz がホストのディレクトリにできた" || fail "DB のバックアップが無い"
[ -n "$(ls "$HOSTDIR"/periodic-uploads-*.tar.gz 2>/dev/null)" ] && ok "periodic-uploads-*.tar.gz ができた" || fail "アップロードのバックアップが無い"
assert_contains "users 7 件と記録" "$out" "users 7 件"
assert_eq "権限は 600" "-rw-------" "$(ls -l "$DBFILE" | cut -c1-10)"
HOST_UID="$(stat -c '%u' "$HOSTDIR" 2>/dev/null || stat -f '%u' "$HOSTDIR")"
FILE_UID="$(stat -c '%u' "$DBFILE" 2>/dev/null || stat -f '%u' "$DBFILE")"
assert_eq "所有者はホスト側のディレクトリの所有者（ホストのユーザーが復元に使える）" "$HOST_UID" "$FILE_UID"
assert_contains "状態ファイルに結果が残る" "$(cat "$HOSTDIR/.periodic-status")" "db=ok"
assert_eq "アップロードの中身が入っている" "images/a.txt" "$(tar tzf "$(ls -1t "$HOSTDIR"/periodic-uploads-*.tar.gz | head -1)" | grep a.txt | sed 's#^\./##')"

echo "- バックアップから復元できる（ダンプの中身が正しい）"
n="$(gunzip -c "$DBFILE" | grep -c "^COPY public.users ")"
assert_eq "ダンプに users のデータが含まれる" 1 "$n"

echo "- 2回目: アップロードは間隔内ならまだ取らず、DB は新しく取る"
sleep 1
run_backup >/dev/null 2>&1
assert_eq "DB のバックアップが2つに増える" 2 "$(ls "$HOSTDIR"/periodic-db-*.sql.gz | wc -l | tr -d ' ')"
assert_eq "アップロードは1つのまま" 1 "$(ls "$HOSTDIR"/periodic-uploads-*.tar.gz | wc -l | tr -d ' ')"

echo "- 世代管理: 直近 KEEP_RECENT 個を残し、それより古いものは「1日1個」にする"
# 過去の日付のダンプを人工的に作る（同じ日に複数、別の日に1つずつ、30日より古いもの）
for ts in 20200101-010000 20200101-050000 20200101-090000 20200102-010000 20200102-050000; do : > "$HOSTDIR/periodic-db-$ts.sql.gz"; done
today="$(date -u +%Y%m%d)"
d5="$(date -u -d "@$(( $(date +%s) - 5*86400 ))" +%Y%m%d 2>/dev/null || date -u -v-5d +%Y%m%d)"
for ts in "$d5-010000" "$d5-050000" "$d5-090000"; do : > "$HOSTDIR/periodic-db-$ts.sql.gz"; done
sleep 1
run_backup -e BACKUP_KEEP_RECENT=3 >/dev/null 2>&1
left="$(ls "$HOSTDIR"/periodic-db-*.sql.gz | sed -E 's#.*/periodic-db-##; s#\.sql\.gz##' | tr '\n' ' ')"
echo "    残ったもの: $left"
assert_eq "30日より古い 2020 年のものは全部消える" 0 "$(ls "$HOSTDIR"/periodic-db-2020*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
assert_eq "5日前は『その日の最新 1個』だけ残る" 1 "$(ls "$HOSTDIR"/periodic-db-${d5}-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
[ -e "$HOSTDIR/periodic-db-${d5}-090000.sql.gz" ] && ok "5日前に残ったのはその日の最新（09:00:00）" || fail "5日前の最新が残っていない"
assert_eq "直近のものは KEEP_RECENT=3 個残る（今日の分）" 3 "$(ls "$HOSTDIR"/periodic-db-${today}-*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"

echo "- 失敗したら、古いバックアップは消さない"
before="$(ls "$HOSTDIR"/periodic-db-*.sql.gz | wc -l | tr -d ' ')"
docker stop "$PG" >/dev/null
run_backup -e BACKUP_KEEP_RECENT=1 -e BACKUP_DB_WAIT_TRIES=2 >/dev/null 2>&1; rc=$?
assert_eq "DB に繋がらない → 終了コード 1" 1 "$rc"
assert_eq "古いバックアップは1つも消えていない" "$before" "$(ls "$HOSTDIR"/periodic-db-*.sql.gz | wc -l | tr -d ' ')"
assert_contains "状態ファイルにエラーが残る" "$(cat "$HOSTDIR/.periodic-status")" "db=error"
docker start "$PG" >/dev/null; wait_pg_ready "$PG" >/dev/null 2>&1; sleep 2

echo "- 空のDB（users が 0 件）では、バックアップせず、古いものも消さない"
psql_db "DELETE FROM users" >/dev/null 2>&1 || psql_db "TRUNCATE users CASCADE" >/dev/null
before="$(ls "$HOSTDIR"/periodic-db-*.sql.gz | wc -l | tr -d ' ')"
out="$(run_backup -e BACKUP_KEEP_RECENT=1 2>&1)"; rc=$?
assert_eq "終了コード 1" 1 "$rc"
assert_contains "users が 0 件と報告" "$out" "users が 0 件"
assert_eq "バックアップは増えず、1つも消えない" "$before" "$(ls "$HOSTDIR"/periodic-db-*.sql.gz | wc -l | tr -d ' ')"

echo "- ヘルスチェック"
docker run --rm -v "$HOSTDIR:/backups" "$IMG" --healthcheck >/dev/null 2>&1; assert_eq "直近のバックアップが新しい → healthy" 0 "$?"
docker run --rm -v "$HOSTDIR:/backups" -e BACKUP_INTERVAL_SECONDS=1 "$IMG" --healthcheck >/dev/null 2>&1; rc=$?
# 間隔 1 秒 → 許容は 30 分。作ったばかりのファイルはまだ新しいので healthy のまま
assert_eq "許容時間内なら healthy" 0 "$rc"
docker run --rm -v "$HOSTDIR:/backups" --entrypoint sh "$IMG" -c 'for f in /backups/periodic-db-*.sql.gz; do touch -d "@$(( $(date +%s) - 20*3600 ))" "$f"; done' >/dev/null 2>&1
docker run --rm -v "$HOSTDIR:/backups" "$IMG" --healthcheck >/dev/null 2>&1; assert_eq "最新でも 20 時間前（間隔4時間の2倍+30分を超える）→ unhealthy" 1 "$?"
EMPTYDIR="$(mktemp -d)"
docker run --rm -v "$EMPTYDIR:/backups" "$IMG" --healthcheck >/dev/null 2>&1; assert_eq "1つも無い（起動直後の印も無い）→ unhealthy" 1 "$?"
rm -rf "$EMPTYDIR"

finish
