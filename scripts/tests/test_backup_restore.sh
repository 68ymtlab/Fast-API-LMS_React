#!/bin/sh
# backup.sh / restore_test.sh / schema_diff.sh の結合テスト（本物の docker と PostgreSQL を使う）。
# 使い捨てのコンテナ・ボリュームだけを触り、終了時に必ず片付ける。本番・開発の lms-db には触れない。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"
cd "$REPO"

SUF="$$"
LIVE="lmstest-live-$SUF"
EMPTY="lmstest-empty-$SUF"
PROJECT="lmtest$SUF"
UPVOL="${PROJECT}_uploads-data"
BACKUP_DIR="db/backups/_test-$SUF"
REMOTE_DIR="$(mktemp -d)"

cleanup() {
    docker rm -f "$LIVE" "$EMPTY" >/dev/null 2>&1 || true
    docker volume rm "$UPVOL" >/dev/null 2>&1 || true
    # コンテナ(root)が作ったファイルが残る場合があるので、コンテナ経由で消す
    docker run --rm -v "$REPO/db/backups:/b" alpine rm -rf "/b/_test-$SUF" >/dev/null 2>&1 || true
    rm -rf "$REMOTE_DIR"
    rmdir db/backups 2>/dev/null || true
}
trap cleanup EXIT

INIT_MOUNTS="-v $REPO/db/init/01-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro \
-v $REPO/db/init/02-progress-migration.sql:/docker-entrypoint-initdb.d/02-progress-migration.sql:ro \
-v $REPO/db/init/03-students-columns-migration.sql:/docker-entrypoint-initdb.d/03-students-columns-migration.sql:ro \
-v $REPO/db/init/02-assignments.sql:/docker-entrypoint-initdb.d/04-assignments.sql:ro \
-v $REPO/db/init/05-soft-delete-email-migration.sql:/docker-entrypoint-initdb.d/05-soft-delete-email-migration.sql:ro"

echo "- 準備: db/init から作った『本番役』DB（users 入り）と uploads ボリューム"
# shellcheck disable=SC2086
docker run -d --name "$LIVE" --label "com.docker.compose.project=$PROJECT" \
    -e POSTGRES_PASSWORD=x -e POSTGRES_DB=lms $INIT_MOUNTS postgres:16-alpine >/dev/null
docker volume create "$UPVOL" >/dev/null
docker run --rm -v "$UPVOL":/d alpine sh -c 'echo hello > /d/a.txt'
wait_pg_ready "$LIVE" || { fail "本番役DBが起動しない"; finish; exit 1; }
docker exec "$LIVE" psql -U postgres -d lms -qc \
    "INSERT INTO users (id, username, display_name, email, password_hash, role_id, is_disabled)
     SELECT g, 'u'||g, 'u'||g, 'u'||g||'@example.com', 'h', 1, false FROM generate_series(1,5) g" \
    || { fail "テスト用ユーザーを作れない"; finish; exit 1; }

export DB_CONTAINER="$LIVE" BACKUP_DIR

echo "- backup.sh: 正常（別マシンへのコピー付き）"
out="$(BACKUP_REMOTE="$REMOTE_DIR/" ./scripts/backup.sh 2>&1)"; rc=$?
assert_eq "終了コード" 0 "$rc"
DBFILE="$(ls -1t "$BACKUP_DIR"/auto-db-*.sql.gz 2>/dev/null | head -1)"
[ -n "$DBFILE" ] && ok "auto-db-*.sql.gz ができた" || fail "auto-db-*.sql.gz が無い"
[ -n "$(ls "$BACKUP_DIR"/auto-uploads-*.tar.gz 2>/dev/null)" ] && ok "auto-uploads-*.tar.gz ができた" || fail "uploads のバックアップが無い"
[ -n "$(ls "$REMOTE_DIR"/auto-db-*.sql.gz 2>/dev/null)" ] && ok "コピー先に届いた" || fail "コピー先に届いていない"
# 権限: 本人のみ（600）
perm="$(ls -l "$DBFILE" | cut -c1-10)"
assert_eq "ファイル権限（個人情報を含むので本人のみ）" "-rw-------" "$perm"

echo "- backup.sh: 世代管理（KEEP_AUTO_BACKUPS=2）"
for _ in 1 2 3; do sleep 1; KEEP_AUTO_BACKUPS=2 ./scripts/backup.sh >/dev/null 2>&1; done
assert_eq "auto-db が2世代に間引かれる" 2 "$(ls "$BACKUP_DIR"/auto-db-*.sql.gz | wc -l | tr -d ' ')"
# 間引きで最初のファイルは消えるので、残っている最新のものを以降のテストで使う
DBFILE="$(ls -1t "$BACKUP_DIR"/auto-db-*.sql.gz | head -1)"
[ -f "$DBFILE" ] && ok "以降のテストに使うバックアップがある" || fail "バックアップが無い"

echo "- backup.sh: コンテナが無い → 失敗"
DB_CONTAINER="no-such-db-$SUF" ./scripts/backup.sh >/dev/null 2>&1; rc=$?
assert_eq "終了コード" 1 "$rc"

echo "- backup.sh: users テーブルが無いDB → 保存せず失敗"
docker run -d --name "$EMPTY" -e POSTGRES_PASSWORD=x postgres:16-alpine >/dev/null
wait_pg_ready "$EMPTY" || fail "空DBが起動しない"
before="$(ls "$BACKUP_DIR" | wc -l | tr -d ' ')"
DB_CONTAINER="$EMPTY" ./scripts/backup.sh >/dev/null 2>&1; rc=$?
assert_eq "終了コード" 1 "$rc"
assert_eq "ファイルが増えていない" "$before" "$(ls "$BACKUP_DIR" | wc -l | tr -d ' ')"

echo "- restore_test.sh: 正常なバックアップ"
out="$(./scripts/restore_test.sh 2>&1)"; rc=$?
assert_eq "終了コード" 0 "$rc"
assert_contains "users 5 件が復元された" "$out" "users 5 件"
assert_contains "成功メッセージ" "$out" "復元テスト成功"

echo "- restore_test.sh: 壊れたファイル → 失敗"
head -c 100 "$DBFILE" > "$REMOTE_DIR/corrupt.sql.gz"
out="$(./scripts/restore_test.sh "$REMOTE_DIR/corrupt.sql.gz" 2>&1)"; rc=$?
assert_eq "終了コード" 1 "$rc"
assert_contains "壊れていることを検出" "$out" "gzip として壊れています"

echo "- restore_test.sh: users が 0 件のダンプ → 失敗"
gunzip -c "$DBFILE" | awk '/^COPY public.users /{print; print "\\."; skip=1; next} skip&&/^\\\./{skip=0; next} !skip{print}' | gzip > "$REMOTE_DIR/zero.sql.gz"
out="$(./scripts/restore_test.sh "$REMOTE_DIR/zero.sql.gz" 2>&1)"; rc=$?
assert_eq "終了コード" 1 "$rc"
assert_contains "users 0 件を検出" "$out" "users が 0 件です"
assert_eq "使い捨てコンテナが残っていない" 0 "$(docker ps -a --format '{{.Names}}' | grep -c '^lms-restore-test-' || true)"

echo "- schema_diff.sh: db/init から作ったDB → 一致"
./scripts/schema_diff.sh >/dev/null 2>&1; rc=$?
assert_eq "終了コード" 0 "$rc"

echo "- schema_diff.sh: 列が足りないDB → 差分を検出"
docker exec "$LIVE" psql -U postgres -d lms -qc "ALTER TABLE users DROP COLUMN display_name CASCADE" >/dev/null 2>&1
out="$(./scripts/schema_diff.sh 2>&1)"; rc=$?
assert_eq "終了コード" 1 "$rc"
assert_contains "差分を表示" "$out" "display_name"

finish
