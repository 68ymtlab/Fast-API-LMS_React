#!/bin/sh
# 「コンテナ・ボリュームを誤って消す」事故の通しの検証（本物の docker compose / PostgreSQL を使う。1〜2分）。
#   1) db と backup コンテナを起動し、定期バックアップがホストのディレクトリにできること
#   2) 事故A: `docker compose down -v`（-f なし。.env の COMPOSE_FILE で本番用の設定が読まれる）でも、DB・アップロードが消えないこと
#   3) 事故B（最悪）: ボリュームそのものを消しても、ホストに残ったバックアップから、DB・アップロードを復旧できること
# 一時ディレクトリ・一時のプロジェクト名・一時のボリューム名で動かし、終了時に片付ける。既存のコンテナ・ボリューム・.env には触れない。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

SUF="$$"
PROJECT="lmtest${SUF}"
# docker-compose.yml には `name: Fast-API-LMS_REACT` があり、プロジェクト名を指定しないと「開発・本番の実際のスタック」と同じ
# プロジェクトになってしまう（`down -v --remove-orphans` で、実際のコンテナが消える）。
# このテストの docker compose は、必ず一時のプロジェクト名で動かす。素の `docker compose` も含め、環境変数で固定する。
export COMPOSE_PROJECT_NAME="$PROJECT"
export LMS_DB_VOLUME="${PROJECT}-postgres-data"
export LMS_UPLOADS_VOLUME="${PROJECT}-uploads-data"
T="$(mktemp -d)"
SAFE=0   # 一時プロジェクトで動いていることを確認できるまで、片付けの docker compose down も実行しない

cleanup() {
    if [ "$SAFE" = "1" ]; then
        (cd "$T" && docker compose -p "$PROJECT" down -v --remove-orphans >/dev/null 2>&1) || true
    fi
    docker volume rm "$LMS_DB_VOLUME" "$LMS_UPLOADS_VOLUME" >/dev/null 2>&1 || true
    docker rmi -f "${PROJECT}-backup" >/dev/null 2>&1 || true
    docker run --rm -v "$T:/t" alpine sh -c 'rm -rf /t/* /t/.[!.]*' >/dev/null 2>&1 || true
    rm -rf "$T"
}
trap cleanup EXIT

tar -C "$REPO" --exclude=node_modules --exclude=.env --exclude=.venv -cf - backup db scripts/setup_tutor_secrets.sh tutor/.env.example docker-compose.yml docker-compose.prod.yml | tar -C "$T" -xf -
mkdir -p "$T/backend" "$T/frontend/server" "$T/tutor"
: > "$T/frontend/server/.env"   # compose が env_file の存在を確認するためのダミー
# setup_tutor_secrets.sh（本番の復旧手順で使う）が読み書きする .env
printf 'DATABASE_URL=postgresql+asyncpg://postgres:drpw@db:5432/lms\n' > "$T/backend/.env"
cp "$T/tutor/.env.example" "$T/tutor/.env"
printf 'POSTGRES_USER=postgres\nPOSTGRES_PASSWORD=drpw\nPOSTGRES_DB=lms\n' > "$T/db/.env"
mkdir -p "$T/db/backups"; chmod 700 "$T/db/backups"   # deploy.sh が作るのと同じ（ホストのディレクトリ）

# 既存のスタックと衝突しないようにする（コンテナ名・ネットワーク）。db / backup だけを使う
cat > "$T/test-override.yml" <<YML
services:
  db:
    container_name: ${PROJECT}-db
  backend:
    container_name: ${PROJECT}-backend
  tutor:
    container_name: ${PROJECT}-tutor
networks:
  default:
    ipam: !reset {}
YML
# deploy.sh が作る .env と同じ（+ テスト用の override）。これで -f なしの docker compose も本番用の設定を読む
printf 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml:test-override.yml\n' > "$T/.env"
cd "$T" || exit 1

# 安全装置: このテストの docker compose が、一時のプロジェクトで動くことを確認する。違えば何も実行せずに止まる
ACTUAL_PROJECT="$(docker compose config 2>/dev/null | sed -n 's/^name: //p' | head -1)"
if [ "$ACTUAL_PROJECT" != "$PROJECT" ]; then
    echo "[ABORT] docker compose のプロジェクト名が一時のもの（${PROJECT}）ではありません（${ACTUAL_PROJECT:-取得失敗}）。"
    echo "        実際のスタックを操作してしまう恐れがあるため、何も実行せずに中止します。"
    exit 1
fi
SAFE=1

psql_db() { docker exec "${PROJECT}-db" psql -U postgres -d lms -tAc "$1"; }
wait_db() {
    n=0
    until [ "$(docker inspect --format '{{.State.Health.Status}}' "${PROJECT}-db" 2>/dev/null)" = "healthy" ]; do
        n=$((n + 1)); [ "$n" -ge 90 ] && return 1; sleep 1
    done
}

echo "- 準備: external のボリュームを作り、db と backup を起動する（素の docker compose = .env の COMPOSE_FILE）"
docker volume create "$LMS_DB_VOLUME" >/dev/null
docker volume create "$LMS_UPLOADS_VOLUME" >/dev/null
docker run --rm -v "$LMS_UPLOADS_VOLUME":/d alpine sh -c 'mkdir -p /d/images/1 && printf SUBMISSION-DATA > /d/images/1/report.txt'
out="$(docker compose up -d --build db 2>&1)"; rc=$?
assert_eq "db が起動する" 0 "$rc"
[ "$rc" -ne 0 ] && { echo "$out" | tail -10; finish; exit 1; }
wait_db && ok "db が healthy になる" || { fail "db が healthy にならない"; finish; exit 1; }
# 本番と同じ状態にする: tutor 用の DB ロール tutor_app を作り、tutor のテーブルの所有者にする（ダンプは所有者として参照する）
./scripts/setup_tutor_secrets.sh >/dev/null 2>&1
assert_eq "tutor_app ロールが作られる（setup_tutor_secrets.sh）" 1 "$(psql_db "select count(*) from pg_roles where rolname='tutor_app'" | tr -d ' ')"
assert_eq "tutor のテーブルの所有者が tutor_app（本番と同じ）" tutor_app "$(psql_db "select tableowner from pg_tables where schemaname='tutor' limit 1" | tr -d ' ')"
psql_db "INSERT INTO users (id, username, display_name, email, password_hash, role_id, is_disabled)
         SELECT g, 'u'||g, 'u'||g, 'u'||g||'@example.com', 'h', 1, false FROM generate_series(1,9) g" >/dev/null
assert_eq "テストデータ（users 9 件）" 9 "$(psql_db 'select count(*) from users' | tr -d ' ')"
docker compose up -d --build backup >/dev/null 2>&1
n=0
until [ -n "$(ls "$T"/db/backups/periodic-db-*.sql.gz 2>/dev/null)" ] && [ -n "$(ls "$T"/db/backups/periodic-uploads-*.tar.gz 2>/dev/null)" ]; do
    n=$((n + 1)); [ "$n" -ge 90 ] && break; sleep 1
done
DBFILE="$(ls -1t "$T"/db/backups/periodic-db-*.sql.gz 2>/dev/null | head -1)"
UPFILE="$(ls -1t "$T"/db/backups/periodic-uploads-*.tar.gz 2>/dev/null | head -1)"
[ -n "$DBFILE" ] && ok "起動直後に、DB の定期バックアップがホストのディレクトリにできた" || fail "DB のバックアップができない（logs: $(docker compose logs --tail=5 backup 2>&1 | tr '\n' ' '))"
[ -n "$UPFILE" ] && ok "アップロードのバックアップもできた" || fail "アップロードのバックアップができない"
[ -n "$DBFILE" ] && gunzip -c "$DBFILE" >/dev/null 2>&1 && ok "ホストのユーザーがバックアップを読める（所有者・権限が正しい）" || fail "ホストのユーザーがバックアップを読めない"
n=0
until [ "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q backup)" 2>/dev/null)" = "healthy" ]; do
    n=$((n + 1)); [ "$n" -ge 40 ] && break; sleep 3
done
assert_eq "backup コンテナが healthy（直近のバックアップが新しい）" healthy "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q backup)" 2>/dev/null)"

echo "- 事故A: -f を付けずに \`docker compose down -v\`（=ボリュームごと消す操作）"
docker compose down -v >/dev/null 2>&1
assert_eq "DB のボリュームが残っている" 1 "$(docker volume ls -q | grep -c "^${LMS_DB_VOLUME}$")"
assert_eq "アップロードのボリュームが残っている" 1 "$(docker volume ls -q | grep -c "^${LMS_UPLOADS_VOLUME}$")"
assert_eq "ホストのバックアップも残っている" 1 "$([ -n "$(ls "$T"/db/backups/periodic-db-*.sql.gz 2>/dev/null)" ] && echo 1 || echo 0)"
docker compose up -d db >/dev/null 2>&1; wait_db
assert_eq "起動し直すと、データはそのまま（users 9 件）" 9 "$(psql_db 'select count(*) from users' | tr -d ' ')"

echo "- 事故B（最悪）: ボリュームそのものを docker volume rm で消す"
docker compose down >/dev/null 2>&1
docker volume rm "$LMS_DB_VOLUME" "$LMS_UPLOADS_VOLUME" >/dev/null 2>&1
assert_eq "DB・アップロードのボリュームが無くなった" 0 "$(docker volume ls -q | grep -c "^${PROJECT}-")"
out="$(docker compose up -d db 2>&1)"; rc=$?
assert_eq "ボリュームが無いまま up しても、空のDBを勝手に作らず失敗する" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
assert_contains "分かりやすいエラー" "$out" "not found"
assert_eq "（空のボリュームも作られていない）" 0 "$(docker volume ls -q | grep -c "^${PROJECT}-")"
assert_eq "ホストのバックアップは残っている" 1 "$([ -f "$DBFILE" ] && [ -f "$UPFILE" ] && echo 1 || echo 0)"

echo "- 復旧: ホストに残ったバックアップから戻す（docs/ops/backup-restore.md の手順どおり）"
docker volume create "$LMS_DB_VOLUME" >/dev/null
docker volume create "$LMS_UPLOADS_VOLUME" >/dev/null
docker compose up -d db >/dev/null 2>&1; wait_db && ok "新しいボリュームで db が起動する" || fail "db が起動しない"
assert_eq "新しいDBは空（users 0 件）" 0 "$(psql_db 'select count(*) from users' | tr -d ' ')"
# tutor_app ロールを作る（ダンプは tutor のテーブルの所有者として参照する）。docs/ops/backup-restore.md の手順 ③
./scripts/setup_tutor_secrets.sh >/dev/null 2>&1
assert_eq "tutor_app ロールを作り直せる（setup_tutor_secrets.sh）" 1 "$(psql_db "select count(*) from pg_roles where rolname='tutor_app'" | tr -d ' ')"
gunzip -c "$DBFILE" | docker exec -i "${PROJECT}-db" psql -U postgres -d lms -q -v ON_ERROR_STOP=1 >/dev/null 2>&1; rc=$?
assert_eq "DB を復元できる（ON_ERROR_STOP=1 でエラーなし）" 0 "$rc"
assert_eq "tutor のテーブルの所有者も tutor_app に戻った" tutor_app "$(psql_db "select tableowner from pg_tables where schemaname='tutor' limit 1" | tr -d ' ')"
assert_eq "users が 9 件に戻った" 9 "$(psql_db 'select count(*) from users' | tr -d ' ')"
docker run --rm -v "$LMS_UPLOADS_VOLUME":/data -v "$T/db/backups":/backup:ro alpine sh -c "cd /data && tar xzf /backup/$(basename "$UPFILE")" >/dev/null 2>&1
assert_eq "アップロードも復元できる" "SUBMISSION-DATA" "$(docker run --rm -v "$LMS_UPLOADS_VOLUME":/d alpine cat /d/images/1/report.txt 2>/dev/null)"
docker compose up -d backup >/dev/null 2>&1
n=0
until [ "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q backup)" 2>/dev/null)" = "healthy" ]; do
    n=$((n + 1)); [ "$n" -ge 40 ] && break; sleep 3
done
assert_eq "復旧後、backup コンテナも healthy に戻る" healthy "$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q backup)" 2>/dev/null)"

finish
