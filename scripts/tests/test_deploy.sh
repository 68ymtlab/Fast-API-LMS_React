#!/bin/sh
# deploy.sh のデータ保護の安全装置のテスト（偽の docker を使うので docker 不要）。
#   - 危険な状況では、バックアップ無しで `up --build` に進まず中止すること
#   - 正常な状況では従来どおり通ること
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

V=fast-api-lms_react_postgres-data
U=fast-api-lms_react_uploads-data

# run_case <名前> <期待する終了コード> <up --build が走るべきか 0/1> <出力に含まれるべき文字列> [ENV=値 ...]
run_case() {
    name="$1"; exp_rc="$2"; exp_up="$3"; exp_text="$4"; shift 4
    T="$(mktemp -d)"
    mkdir -p "$T/scripts" "$T/db" "$T/backend" "$T/frontend/server" "$T/tutor/data/stage4"
    cp "$REPO/scripts/deploy.sh" "$REPO/scripts/migrate_legacy_images.sh" "$T/scripts/"
    mkdir -p "$T/backend/static/images"
    [ -n "${CASE_LEGACY_IMAGE:-}" ] && echo x > "$T/backend/static/images/legacy.png"
    [ -n "${CASE_PRECREATE_BACKUP_DIR:-}" ] && { mkdir -p "$T/db/backups"; chmod 755 "$T/db/backups"; }
    [ -n "${CASE_ROOT_ENV-}" ] && printf '%s\n' "$CASE_ROOT_ENV" > "$T/.env"
    [ -n "${CASE_PERIODIC:-}" ] && { mkdir -p "$T/db/backups"; : > "$T/db/backups/periodic-db-20261002-000000.sql.gz"; }
    : > "$T/docker-compose.yml"; : > "$T/docker-compose.prod.yml"
    printf 'POSTGRES_USER=postgres\nPOSTGRES_DB=lms\n' > "$T/db/.env"
    printf '%s\n' "${CASE_BACKEND_ENV:-SECRET_KEY=x}" > "$T/backend/.env"; echo x > "$T/frontend/server/.env"
    printf 'TUTOR_SERVICE_TOKEN=abc\nTUTOR_DATABASE_URL=postgresql://x\n' > "$T/tutor/.env"
    : > "$T/tutor/data/stage4/embeddings.json"; : > "$T/tutor/data/stage4/knowledge_graph.json"
    FAKE_LOG="$T/log"; : > "$FAKE_LOG"
    out="$(env "$@" BACKUP_CHECK_WAIT=0 FAKE_LOG="$FAKE_LOG" PATH="$HERE/fakebin:$PATH" sh "$T/scripts/deploy.sh" 2>&1)"; rc=$?
    ups="$(grep -c 'up --build' "$FAKE_LOG" || true)"
    LAST_UP="$(grep 'up --build' "$FAKE_LOG" | head -1)"
    LAST_OUT="$out"
    echo "- $name"
    assert_eq "終了コード" "$exp_rc" "$rc"
    assert_eq "up --build の実行回数" "$exp_up" "$ups"
    [ -n "$exp_text" ] && assert_contains "メッセージ" "$out" "$exp_text"
    LAST_BACKUPS="$(ls "$T/db/backups" 2>/dev/null | tr '\n' ' ')"
    LAST_DIR_PERM="$(ls -ld "$T/db/backups" 2>/dev/null | cut -c1-10)"
    LAST_FILE_PERM="$(ls -l "$T/db/backups"/db-*.sql.gz 2>/dev/null | head -1 | cut -c1-10)"
    LAST_RUNS="$(grep -c '^docker run' "$FAKE_LOG" || true)"
    LAST_DOTENV="$(cat "$T/.env" 2>/dev/null)"
    LAST_VOLCREATE="$(grep -c '^docker volume create' "$FAKE_LOG" || true)"
    LAST_BACKUPDIR_PERM="$(ls -ld "$T/db/backups" 2>/dev/null | cut -c1-10)"
    rm -rf "$T"
    # 関数呼び出しの前に付けた CASE_* は、sh（dash）では呼び出し後も残る。次のケースに影響しないよう必ず消す
    unset CASE_BACKEND_ENV CASE_LEGACY_IMAGE CASE_PRECREATE_BACKUP_DIR CASE_ROOT_ENV CASE_PERIODIC
}

run_case "正常: 既存データがあればバックアップして進む" 0 1 "[OK] DB バックアップ" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
case "$LAST_BACKUPS" in *db-*.sql.gz*) ok "バックアップファイルができた";; *) fail "バックアップファイルができていない（'$LAST_BACKUPS'）";; esac
assert_contains "up がリポジトリ直下の .env も読む（LMS_DB_VOLUME など、.env に書いた上書きが無視されない）" "$LAST_UP" "--env-file .env --env-file frontend/server/.env"
assert_contains "up に --renew-anon-volumes が付く（古い .venv の匿名ボリュームを持ち越さない）" "$LAST_UP" "--renew-anon-volumes"
assert_not_contains "名前付きボリュームを消す -v は付かない" "$LAST_UP" " down"
assert_contains "up --build に frontend/server/.env が --env-file で渡る（NEXT_PUBLIC_* をビルドに渡すため）" "$LAST_UP" "--env-file frontend/server/.env"

run_case "psql が失敗 → 空と誤認せず中止" 1 0 "DB の状態を確認できませんでした" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U" FAKE_PSQL=fail
run_case "psql の出力が不正 → 中止" 1 0 "出力が不正です" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U" FAKE_PSQL=garbage
run_case "テーブルが無い空のDB → バックアップを省略して進む" 0 1 "空のDB" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U" FAKE_PSQL=empty
run_case "稼働中DBのボリュームが想定と違う → 中止" 1 0 "想定と異なります" \
    FAKE_CONTAINER=1 FAKE_MOUNT=other_postgres-data FAKE_VOLUMES="$V other_postgres-data"
run_case "名前付きボリュームではない（bind mount）→ 中止" 1 0 "想定と異なります" \
    FAKE_CONTAINER=1 FAKE_MOUNT= FAKE_VOLUMES="$V $U"
run_case "想定のボリュームが無く別名がある → 中止" 1 0 "別のDBボリュームが存在します" \
    FAKE_CONTAINER=0 FAKE_VOLUMES="old_postgres-data"
run_case "上と同じでも ALLOW_FRESH_DB=1 なら進む" 0 1 "初回デプロイ" \
    FAKE_CONTAINER=0 FAKE_VOLUMES="old_postgres-data" ALLOW_FRESH_DB=1
run_case "本当の初回デプロイ" 0 1 "初回デプロイ" \
    FAKE_CONTAINER=0 FAKE_VOLUMES=""
run_case "スタック停止中でボリュームだけある → バックアップして進む" 0 1 "[OK] DB バックアップ" \
    FAKE_CONTAINER=0 FAKE_VOLUMES="$V $U"
run_case "pg_dump が失敗 → 中止" 1 0 "pg_dump）に失敗" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U" FAKE_DUMP=fail
run_case "ダンプが途中で切れている → 中止" 1 0 "内容が不正です" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U" FAKE_DUMP=trunc
run_case "compose config が失敗 → 中止" 1 0 "プロジェクト名を取得できません" \
    FAKE_CONFIG_FAIL=1 FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
run_case "SKIP_BACKUP=1 は警告つきで進む" 0 1 "SKIP_BACKUP=1" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U" SKIP_BACKUP=1

# ---- docker compose のバージョン / 本番の backend の構成 / 旧形式の画像 / 権限 ----
run_case "compose が古い（v2.20）→ 中止" 1 0 "v2.24 以上と確認できません" \
    FAKE_COMPOSE_VERSION=2.20.3 FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
run_case "compose のバージョンが判定できない → 中止" 1 0 "v2.24 以上と確認できません" \
    FAKE_COMPOSE_VERSION= FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
run_case "compose v2.24 は通る" 0 1 "docker compose 2.24.0" \
    FAKE_COMPOSE_VERSION=2.24.0 FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
run_case "compose が v5（新しい）も通る" 0 1 "docker compose 5.1.0" \
    FAKE_COMPOSE_VERSION=v5.1.0 FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
run_case "ALLOW_OLD_COMPOSE=1 なら警告つきで進む" 0 1 "ALLOW_OLD_COMPOSE=1" \
    FAKE_COMPOSE_VERSION=2.20.3 ALLOW_OLD_COMPOSE=1 FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"

run_case "マージ後の backend に開発用の設定（bind mount / --reload）が残っている → 中止" 1 0 "開発用の設定が残っています" \
    FAKE_BACKEND_CFG=dev FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_contains "どの設定かを表示する（--reload）" "$LAST_OUT" "--reload"
assert_contains "どの設定かを表示する（bind mount）" "$LAST_OUT" "target: /src/backend"

CASE_LEGACY_IMAGE=1 run_case "旧形式の画像がある → uploads ボリュームへ移行してから進む" 0 1 "旧形式の画像の移行" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_contains "コピーする" "$LAST_OUT" "旧形式の画像 1 個"
CASE_LEGACY_IMAGE=1 run_case "旧形式の画像の移行に失敗 → 中止（画像が消えたまま起動しない）" 1 0 "移行に失敗しました" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U" FAKE_RUN_FAIL=1
run_case "旧形式の画像が無い → 移行は不要と表示して進む" 0 1 "移行は不要です" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"

run_case "バックアップの権限: ファイル 600・ディレクトリ 700" 0 1 "[OK] DB バックアップ" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_eq "バックアップファイルは本人のみ" "-rw-------" "$LAST_FILE_PERM"
assert_eq "バックアップディレクトリは本人のみ" "drwx------" "$LAST_DIR_PERM"
CASE_PRECREATE_BACKUP_DIR=1 run_case "以前 755 で作られたバックアップディレクトリも 700 にする" 0 1 "[OK] DB バックアップ" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_eq "ディレクトリが 700 になった" "drwx------" "$LAST_DIR_PERM"

# ---- ボリューム（external）・.env の COMPOSE_FILE・定期バックアップ ----
run_case "初回デプロイ: external のボリュームを deploy.sh が作る（DB・アップロードの2つ）" 0 1 "初回デプロイ: ボリュームを作成しました" \
    FAKE_CONTAINER=0 FAKE_VOLUMES=""
assert_eq "docker volume create が2回" 2 "$LAST_VOLCREATE"

run_case "既存の本番（DB・アップロードとも有る）: ボリュームは作らない" 0 1 "[OK]    $V / $U" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_eq "docker volume create は呼ばれない" 0 "$LAST_VOLCREATE"

run_case "DB はあるのにアップロードのボリュームが無い → 中止（消えた可能性。空で作らない）" 1 0 "アップロードのボリューム" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V"
assert_eq "勝手に作らない" 0 "$LAST_VOLCREATE"
run_case "ALLOW_FRESH_UPLOADS=1 なら警告つきで空のアップロードボリュームを作って進む" 0 1 "ALLOW_FRESH_UPLOADS=1" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V" ALLOW_FRESH_UPLOADS=1
assert_eq "アップロードのボリュームだけ作る" 1 "$LAST_VOLCREATE"

run_case "ボリューム名は compose の設定（external の name）から取る（別名にも追従）" 0 1 "[OK]    other-db-vol / other-up-vol" \
    FAKE_DB_VOLUME_NAME=other-db-vol FAKE_UPLOADS_VOLUME_NAME=other-up-vol FAKE_CONTAINER=1 FAKE_MOUNT=other-db-vol FAKE_VOLUMES="other-db-vol other-up-vol"

run_case "リポジトリ直下の .env が無い → COMPOSE_FILE を書いて作る" 0 1 ".env を作成しました" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_contains "COMPOSE_FILE が書かれる" "$LAST_DOTENV" "COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml"
CASE_ROOT_ENV='FOO=bar' run_case ".env はあるが COMPOSE_FILE が無い → 追記（既存の行は残す）" 0 1 ".env に COMPOSE_FILE を追記しました" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_contains "既存の FOO=bar が残る" "$LAST_DOTENV" "FOO=bar"
assert_contains "COMPOSE_FILE が追記される" "$LAST_DOTENV" "COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml"
CASE_ROOT_ENV='COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml' run_case ".env に正しい COMPOSE_FILE がある → そのまま（重複しない）" 0 1 "COMPOSE_FILE（素の docker compose でも本番用の設定を使う）" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_eq "COMPOSE_FILE の行が1つのまま" 1 "$(printf '%s\n' "$LAST_DOTENV" | grep -c '^COMPOSE_FILE=')"
CASE_ROOT_ENV='COMPOSE_FILE=docker-compose.yml' run_case ".env に別の COMPOSE_FILE がある → 警告して変更しない" 0 1 "想定" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_eq "書き換えない" "COMPOSE_FILE=docker-compose.yml" "$LAST_DOTENV"

run_case "backup 用のホストのディレクトリ（db/backups）を、先に 700 で作る" 0 1 "[OK] DB バックアップ" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_eq "db/backups は 700" "drwx------" "$LAST_BACKUPDIR_PERM"
run_case "初回デプロイでも db/backups を 700 で作る（Docker に root 所有で作らせない）" 0 1 "初回デプロイ" \
    FAKE_CONTAINER=0 FAKE_VOLUMES=""
assert_eq "初回でも 700" "drwx------" "$LAST_BACKUPDIR_PERM"

CASE_PERIODIC=1 run_case "定期バックアップが取れている → OK と表示" 0 1 "periodic-db-20261002-000000.sql.gz" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
run_case "定期バックアップがまだ無い → 警告（デプロイは止めない）" 0 1 "定期バックアップがまだ取れていません" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"

# ---- CHANGE_ME ----
CASE_BACKEND_ENV='SECRET_KEY=CHANGE_ME_SECRET_VALUE_xyz' \
run_case "CHANGE_ME が残っている → 中止（項目名だけ表示し、値は表示しない）" 1 0 "CHANGE_ME が残っています" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"
assert_contains "どの項目かを表示する" "$LAST_OUT" "SECRET_KEY"
assert_not_contains "値そのものは表示しない" "$LAST_OUT" "CHANGE_ME_SECRET_VALUE_xyz"

CASE_BACKEND_ENV='# SECRET_KEY は CHANGE_ME のままにしない（コメント行）' \
run_case "コメント行の CHANGE_ME は対象外 → 進む" 0 1 "CHANGE_ME なし" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U"

CASE_BACKEND_ENV='SECRET_KEY=CHANGE_ME_SECRET_VALUE_xyz' \
run_case "ALLOW_CHANGE_ME=1 なら警告つきで進む" 0 1 "ALLOW_CHANGE_ME=1" \
    FAKE_CONTAINER=1 FAKE_MOUNT=$V FAKE_VOLUMES="$V $U" ALLOW_CHANGE_ME=1

finish
