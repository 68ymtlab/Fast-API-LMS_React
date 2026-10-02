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
#   ALLOW_CHANGE_ME=1  .env に CHANGE_ME が残っていても続行する（非推奨）
#   ALLOW_OLD_COMPOSE=1  compose が v2.24 未満（または判定不能）でも続行する（非推奨。本番の構成が壊れる恐れ）
#   ALLOW_FRESH_DB=1  想定外の名前のDBボリュームが他にあっても、空のDBで新規に始めることを許可する
#   ALLOW_FRESH_UPLOADS=1  DB はあるのにアップロードのボリュームが無いとき、空で作ることを許可する
#   KEEP_BACKUPS=N  保持するバックアップ世代数（既定: 10）

set -e

# バックアップには個人情報が入る。このスクリプトが作るファイル・ディレクトリは本人だけが読めるようにする
umask 077

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
# ビルドする `up --build` だけ、frontend/server/.env を compose の変数として読ませる。
# frontend の NEXT_PUBLIC_* はビルド時にバンドルへ焼き込まれ、その値は build.args 経由で渡す
# （.env をイメージに入れない代わり。付け忘れるとビルドが失敗する）
COMPOSE_BUILD="docker compose --env-file frontend/server/.env -f docker-compose.yml -f docker-compose.prod.yml"
BACKUP_DIR="db/backups"
KEEP_BACKUPS="${KEEP_BACKUPS:-10}"
TS="$(date +%Y%m%d-%H%M%S)"

echo "=== Fast-API-LMS 本番デプロイ（データ保持型）==="

# --- docker compose のバージョン確認 ---
# docker-compose.prod.yml は !override / !reset（compose v2.24 以上）で、開発用の設定（ホストのソースの bind mount・
# --reload など）を打ち消している。古い compose だと解釈されず、開発用の設定のまま本番で動いてしまう。
CV="$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)"
CV_MAJOR="${CV%%.*}"
CV_REST="${CV#*.}"
CV_MINOR="${CV_REST%%.*}"
CV_OK=0
case "$CV_MAJOR$CV_MINOR" in
    ''|*[!0-9]*) CV_OK=0 ;;
    *) if [ "$CV_MAJOR" -gt 2 ] || { [ "$CV_MAJOR" -eq 2 ] && [ "$CV_MINOR" -ge 24 ]; }; then CV_OK=1; fi ;;
esac
if [ "$CV_OK" -eq 1 ]; then
    echo "[OK]    docker compose ${CV}"
elif [ "${ALLOW_OLD_COMPOSE:-}" = "1" ]; then
    echo "[WARN] docker compose のバージョン（${CV:-不明}）が v2.24 以上と確認できませんが、ALLOW_OLD_COMPOSE=1 のため続行します（非推奨）。"
else
    echo "[ERROR] docker compose が v2.24 以上と確認できません（検出: ${CV:-不明}）。"
    echo "        docker-compose.prod.yml の !override / !reset が効かず、開発用の設定のまま動く恐れがあるため中止します。"
    echo "        docker compose を更新してください（docker compose version で確認）。"
    exit 1
fi

# --- 素の `docker compose` でも本番用の設定が使われるようにする（誤操作でデータを消さないための保険）---
# サーバーで -f を付けずに `docker compose down -v` と打つと、本番用の設定（DB・アップロードのボリュームを external にして
# 守る設定）が読まれず、ボリュームごと消えてしまう。リポジトリ直下の .env（git 管理外）に COMPOSE_FILE を書いておくと、
# -f なしの docker compose も、docker-compose.yml + docker-compose.prod.yml を読む。
WANT_COMPOSE_FILE="COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml"
if [ ! -f .env ]; then
    printf '# 本番サーバー用: -f を付けない docker compose でも本番用の設定を読む（scripts/deploy.sh が作成）\n%s\n' "$WANT_COMPOSE_FILE" > .env
    echo "[OK]    .env を作成しました（${WANT_COMPOSE_FILE}）。素の docker compose でも本番用の設定が使われます"
elif grep -q '^COMPOSE_FILE=' .env; then
    if grep -qxF "$WANT_COMPOSE_FILE" .env; then
        echo "[OK]    .env の COMPOSE_FILE（素の docker compose でも本番用の設定を使う）"
    else
        echo "[WARN] .env の COMPOSE_FILE が想定（${WANT_COMPOSE_FILE}）と異なります。変更しません。"
        echo "       素の docker compose down -v で、DB・アップロードのボリュームが消える設定になっていないか確認してください。"
    fi
else
    printf '\n# 本番サーバー用: -f を付けない docker compose でも本番用の設定を読む（scripts/deploy.sh が追記）\n%s\n' "$WANT_COMPOSE_FILE" >> .env
    echo "[OK]    .env に COMPOSE_FILE を追記しました。素の docker compose でも本番用の設定が使われます"
fi

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
check_env "tutor/.env"             "tutor/.env.example"

if [ "$MISSING" -ne 0 ]; then
    echo ""
    echo "上記の .env ファイルを作成してから再実行してください。"
    exit 1
fi

# --- CHANGE_ME（.env.example の「ここを書き換える」目印）が残っていないか ---
# 残っていると、リポジトリで公開されている値のまま本番が動く（例: SECRET_KEY でトークンを偽造できる、
# tutor のトークンが無効で質問のたびに認証エラーになる）。コメント行は対象外。
# どうしても残したまま進めるときだけ ALLOW_CHANGE_ME=1 を付ける。
echo ""
echo "=== CHANGE_ME チェック ==="
FOUND=0
for f in backend/.env frontend/server/.env db/.env tutor/.env; do
    # 行番号付きで、コメント行（先頭が # の行）を除いた CHANGE_ME を探す。値は表示せず、項目名だけ出す
    HITS="$(grep -n 'CHANGE_ME' "$f" 2>/dev/null | grep -vE '^[0-9]+:[[:space:]]*#' | sed -E 's/^([0-9]+):([^=]*)=.*/\1 行目: \2/' || true)"
    if [ -n "$HITS" ]; then
        echo "[ERROR] $f に CHANGE_ME が残っています。本番の値に書き換えてください:"
        echo "$HITS" | sed 's/^/          /'
        FOUND=1
    fi
done
if [ "$FOUND" -eq 0 ]; then
    echo "[OK] CHANGE_ME なし"
elif [ "${ALLOW_CHANGE_ME:-}" = "1" ]; then
    echo "[WARN] ALLOW_CHANGE_ME=1 が指定されているため、CHANGE_ME が残ったまま続行します（非推奨）。"
else
    echo ""
    echo "デプロイを中止します。上の項目を書き換えてから再実行してください（作り方は docs/ops/runbook-deploy.md の「初回セットアップ」）。"
    exit 1
fi

# --- DB 接続情報を読み込み ---
# shellcheck disable=SC1091
. ./db/.env
PGUSER="${POSTGRES_USER:-postgres}"
PGDB="${POSTGRES_DB:-lms}"

# --- 既存データの有無を判定し、あればバックアップ ---
echo ""
echo "=== バックアップ ==="

# --- 既存DBの検出（取り違えると空DBで起動してしまうので厳密に行う）---
# compose が使うプロジェクト名（正規化済み）。DB / uploads のボリューム名はここから決まる
CONFIG_OUT="$($COMPOSE config 2>/dev/null || true)"
PROJECT="$(printf '%s\n' "$CONFIG_OUT" | sed -n 's/^name: //p' | head -1)"
if [ -z "$PROJECT" ]; then
    echo "[ERROR] compose のプロジェクト名を取得できませんでした（$COMPOSE config が失敗）。デプロイを中止します。"
    exit 1
fi

# 本番の backend に開発用の設定（ホストのソースの bind mount・.venv の匿名ボリューム・--reload）が残っていないか。
# compose の volumes は「マージ」されるため、書き方を誤ると打ち消せない（その状態だと、イメージ内のコードではなく
# ホストのファイルで動き、git pull だけで本番のコードが入れ替わる）。マージ後の設定で確認する。
BACKEND_CFG="$(printf '%s\n' "$CONFIG_OUT" | awk '/^  backend:/{f=1; next} f && /^  [A-Za-z0-9_-]+:/{f=0} f{print}')"
if printf '%s\n' "$BACKEND_CFG" | grep -qE -- '--reload|target: /src/backend($|/)'; then
    echo "[ERROR] 本番用の設定をマージした結果の backend に、開発用の設定が残っています:"
    printf '%s\n' "$BACKEND_CFG" | grep -nE -- '--reload|target: /src/backend($|/)' | sed 's/^/          /'
    echo "        docker-compose.prod.yml の backend（volumes: !override / command: !reset null）を確認してください。"
    echo "        このまま進むと、ホストのファイルで --reload 付きで動いてしまうため中止します。"
    exit 1
fi
# DB / アップロードのボリューム名は、マージ後の compose の設定（external の name）から取得する
volume_name() {
    printf '%s\n' "$CONFIG_OUT" | awk -v key="  $1:" '$0==key{f=1; next} f && /^  [A-Za-z0-9_-]+:/{f=0} f && /^    name:/{print $2; exit}'
}
EXPECTED_DB_VOLUME="$(volume_name postgres-data)"
EXPECTED_DB_VOLUME="${EXPECTED_DB_VOLUME:-${PROJECT}_postgres-data}"
EXPECTED_UPLOADS_VOLUME="$(volume_name uploads-data)"
EXPECTED_UPLOADS_VOLUME="${EXPECTED_UPLOADS_VOLUME:-${PROJECT}_uploads-data}"

# 既に lms-db コンテナがあるなら、実際にマウントされているボリュームが compose の想定と一致するか確認する。
# 不一致のまま `up` すると compose が別の（空の）ボリュームで db を作り直し、データが消えたように見える。
if docker inspect lms-db >/dev/null 2>&1; then
    MOUNTED_DB_VOLUME="$(docker inspect lms-db --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}')"
    if [ "$MOUNTED_DB_VOLUME" != "$EXPECTED_DB_VOLUME" ]; then
        echo "[ERROR] 稼働中の lms-db が使っているボリュームが想定と異なります。"
        echo "        現在のマウント: ${MOUNTED_DB_VOLUME:-（名前付きボリュームではない）}"
        echo "        compose の想定: $EXPECTED_DB_VOLUME"
        echo "        このまま進むと空のDBで作り直される可能性があるため中止します。"
        echo "        原因（別ディレクトリ／別プロジェクト名でのデプロイなど）を確認してください。"
        exit 1
    fi
fi

DB_VOLUME=""
if docker volume inspect "$EXPECTED_DB_VOLUME" >/dev/null 2>&1; then
    DB_VOLUME="$EXPECTED_DB_VOLUME"
else
    # 想定のボリュームは無いが、名前の似たDBボリュームが別にある場合は、初回デプロイと決めつけない
    OTHER_DB_VOLUMES="$(docker volume ls -q | grep -E '_postgres-data$' || true)"
    if [ -n "$OTHER_DB_VOLUMES" ] && [ "$ALLOW_FRESH_DB" != "1" ]; then
        echo "[ERROR] 想定のDBボリューム ($EXPECTED_DB_VOLUME) がありませんが、別のDBボリュームが存在します:"
        echo "$OTHER_DB_VOLUMES" | sed 's/^/          - /'
        echo "        本番データが別名のボリュームに残っている可能性があります。空のDBで起動する前に確認してください。"
        echo "        本当に新規のDBで始める場合のみ ALLOW_FRESH_DB=1 を付けて再実行してください。"
        exit 1
    fi
fi

if [ -z "$DB_VOLUME" ]; then
    echo "[INFO] DB ボリュームが存在しません（初回デプロイ）。バックアップはスキップします。"
elif [ "$SKIP_BACKUP" = "1" ]; then
    echo "[WARN] SKIP_BACKUP=1 が指定されています。バックアップせずに続行します（非推奨）。"
else
    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"   # 以前のデプロイで 755 などで作られていても、本人だけにする

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

    # 実データが入っているか確認する。
    # psql の失敗を「空」と取り違えない（取り違えるとバックアップ無しでデプロイが進む）ので、
    # 終了コードを必ず見て、失敗・想定外の出力ならデプロイを中止する。
    if ! TABLES="$($COMPOSE exec -T db psql -U "$PGUSER" -d "$PGDB" -tAc \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema IN ('public','tutor')" 2>&1)"; then
        echo "[ERROR] DB の状態を確認できませんでした（psql 失敗）。バックアップ無しで進めないため中止します。"
        echo "        db/.env の POSTGRES_USER / POSTGRES_DB が実DBと一致しているか確認してください。"
        echo "$TABLES" | sed 's/^/        /'
        exit 1
    fi
    TABLES="$(printf '%s' "$TABLES" | tr -d '[:space:]')"
    case "$TABLES" in
        ''|*[!0-9]*)
            echo "[ERROR] DB の状態確認の出力が不正です: '$TABLES'。デプロイを中止します。"
            exit 1
            ;;
    esac

    if [ "$TABLES" = "0" ]; then
        echo "[INFO] DB にテーブルがありません（空のDB）。バックアップはスキップします。"
    else
        HAS_DATA=1
        echo "→ DB をダンプ中（テーブル ${TABLES} 個）..."
        DB_BACKUP="$BACKUP_DIR/db-$TS.sql.gz"
        DB_TMP="$BACKUP_DIR/db-$TS.sql.tmp"
        # pg_dump をパイプで gzip に繋ぐと、pg_dump が失敗しても pipeline の終了コードは
        # gzip のものになり失敗を見逃す（gzip は空入力でも成功する）。
        # そのため一旦生ファイルへ出力し、終了コードと内容を検証してから圧縮する。
        # --clean --if-exists: 既存のDBに流し込んで復元できるようにする（復元手順は docs/ops/backup-restore.md）
        if ! $COMPOSE exec -T db pg_dump -U "$PGUSER" -d "$PGDB" --clean --if-exists > "$DB_TMP"; then
            echo "[ERROR] DB バックアップ（pg_dump）に失敗しました。デプロイを中止します。"
            rm -f "$DB_TMP"
            exit 1
        fi
        # pg_dump は先頭に 'PostgreSQL database dump'、末尾に 'PostgreSQL database dump complete' を出力する。
        # どちらか欠けていれば、壊れている／途中で切れているとみなして中止する。
        if ! grep -q "PostgreSQL database dump" "$DB_TMP" || ! grep -q "PostgreSQL database dump complete" "$DB_TMP"; then
            echo "[ERROR] DB バックアップの内容が不正です（ヘッダまたは終端が無い）。デプロイを中止します。"
            rm -f "$DB_TMP"
            exit 1
        fi
        if ! gzip "$DB_TMP" || ! gzip -t "$DB_TMP.gz"; then
            echo "[ERROR] DB バックアップの圧縮に失敗しました。デプロイを中止します。"
            rm -f "$DB_TMP" "$DB_TMP.gz"
            exit 1
        fi
        mv "$DB_TMP.gz" "$DB_BACKUP"
        echo "[OK] DB バックアップ: $DB_BACKUP ($(du -h "$DB_BACKUP" | cut -f1))"

        # アップロードファイル（提出物・画像）もバックアップ
        UP_VOLUME=""
        if docker volume inspect "$EXPECTED_UPLOADS_VOLUME" >/dev/null 2>&1; then
            UP_VOLUME="$EXPECTED_UPLOADS_VOLUME"
        fi
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

# --- AI チューター（tutor）の前提チェック ---
echo ""
echo "=== AI チューター（tutor）の前提チェック ==="
# 共有シークレットが空だと tutor は誰からでも叩ける。本番では必須
if ! grep -qE '^TUTOR_SERVICE_TOKEN=.+' tutor/.env 2>/dev/null; then
    echo "[ERROR] tutor/.env の TUTOR_SERVICE_TOKEN が空です。次を実行してから再デプロイしてください:"
    echo "        ./scripts/setup_tutor_secrets.sh    # 共有シークレットと tutor_app DB ロールを作成"
    exit 1
fi
if ! grep -qE '^TUTOR_DATABASE_URL=.+' tutor/.env 2>/dev/null; then
    echo "[ERROR] tutor/.env の TUTOR_DATABASE_URL が空です。AIチューターの本番運用には永続化DBが必要です。"
    echo "        ./scripts/setup_tutor_secrets.sh を実行して tutor_app ロールを設定してください。"
    exit 1
fi
# 知識ベース（研究側から同期するファイル）。無ければ同期を試みる
if [ ! -f tutor/data/stage4/embeddings.json ] || [ ! -f tutor/data/stage4/knowledge_graph.json ]; then
    SRC="${AGENTS_WORKSPACE:-/Users/kaihara/workspace/project/agents/workspace}"
    if [ -d "$SRC/rag/textbooks/linear-algebra/stage4_qdrant" ]; then
        echo "→ 知識ベースが無いので研究側から同期します: $SRC"
        AGENTS_WORKSPACE="$SRC" ./tutor/scripts/sync_from_agents.sh
    else
        echo "[ERROR] tutor/data/stage4/ に知識ベース（embeddings.json / knowledge_graph.json）がありません。"
        echo "        研究側（agents/workspace）が見える環境で ./tutor/scripts/sync_from_agents.sh を実行するか、"
        echo "        同期済みの tutor/data/stage4/ をこのサーバーにコピーしてください（docs/ai-tutor/ai-tutor-handover.md 参照）。"
        exit 1
    fi
else
    echo "[OK]    tutor/data/stage4/（$(sed -n 's/^agents_git: //p' tutor/data/stage4/SYNC_INFO.txt 2>/dev/null || echo '同期情報なし')）"
fi

# --- バックアップ保存先（ホストのディレクトリ）と、external のボリュームの用意 ---
# backup コンテナは ./db/backups に保存する。無いと Docker が root 所有で作ってしまうので、先に自分で作る
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# DB・アップロードのボリュームは external（docker-compose.prod.yml）。compose は作ってくれない
# （無いときに空のボリュームを勝手に作って、空のDBで起動してしまうのを防ぐため）。
#   - 初回デプロイ（DB のボリュームが無い）なら、ここで作る
#   - DB はあるのにアップロードのボリュームだけ無いときは、消えた可能性があるので止める
echo ""
echo "=== ボリュームの確認 ==="
if [ -z "$DB_VOLUME" ]; then
    docker volume create "$EXPECTED_DB_VOLUME" >/dev/null
    docker volume create "$EXPECTED_UPLOADS_VOLUME" >/dev/null
    echo "[INFO] 初回デプロイ: ボリュームを作成しました（$EXPECTED_DB_VOLUME / ${EXPECTED_UPLOADS_VOLUME}）"
elif docker volume inspect "$EXPECTED_UPLOADS_VOLUME" >/dev/null 2>&1; then
    echo "[OK]    $EXPECTED_DB_VOLUME / $EXPECTED_UPLOADS_VOLUME"
elif [ "${ALLOW_FRESH_UPLOADS:-}" = "1" ]; then
    docker volume create "$EXPECTED_UPLOADS_VOLUME" >/dev/null
    echo "[WARN] ALLOW_FRESH_UPLOADS=1: アップロードのボリューム（${EXPECTED_UPLOADS_VOLUME}）を空で作成しました"
else
    echo "[ERROR] DB のボリュームはありますが、アップロードのボリューム（${EXPECTED_UPLOADS_VOLUME}）がありません。"
    echo "        提出物・画像が消えた可能性があります。ホストの db/backups/ にバックアップが無いか確認してください。"
    echo "        本当にアップロードを空で始めるなら ALLOW_FRESH_UPLOADS=1 を付けて再実行してください。"
    exit 1
fi

# --- 旧形式の画像（./static/images/...）の移行 ---
# 本番用の backend はホストの backend/ を bind mount しないため、ホストに残っている旧形式の画像は
# uploads ボリュームへコピーしておく必要がある（上書きしない・元は消さない・何度実行しても安全）。
# この時点で、アップロードのバックアップは取得済み。
echo ""
echo "=== 旧形式の画像の移行 ==="
if ! sh ./scripts/migrate_legacy_images.sh "$EXPECTED_UPLOADS_VOLUME"; then
    echo "[ERROR] 旧形式の画像の移行に失敗しました。このまま進むと、旧形式の画像が表示されなくなるため中止します。"
    exit 1
fi

# --- ビルドして起動（-v は使わない = データ保持）---
echo ""
echo "=== Docker イメージをビルドして起動 ==="
# --renew-anon-volumes (-V): 匿名ボリュームだけを作り直す（名前付きボリューム＝DB・アップロードは対象外で、消えない）。
# 本番の backend は /src/backend/.venv が匿名ボリュームで、再デプロイしても古いまま残る。そのため、
# 新しい依存（例: tutor 用の httpx）がイメージに入っていても使われず、起動時に ImportError になる。
$COMPOSE_BUILD up --build -d --renew-anon-volumes

echo ""
echo "=== 起動状態確認 ==="
$COMPOSE ps
# tutor は知識ベースの読み込みに数十秒かかる。health を待って結果を出す（失敗してもデプロイ自体は止めない）
echo ""
echo "=== AI チューター（tutor）の起動確認 ==="
i=0; TUTOR_OK=0
while [ "$i" -lt 40 ]; do
    if $COMPOSE exec -T tutor curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1; then TUTOR_OK=1; break; fi
    i=$((i + 1)); sleep 5
done
if [ "$TUTOR_OK" = "1" ]; then
    echo "[OK]    tutor: $($COMPOSE exec -T tutor curl -fsS http://127.0.0.1:8765/health 2>/dev/null | head -c 160)"
else
    echo "[WARN] tutor が health になりません。ログを確認してください: $COMPOSE logs --tail=50 tutor"
fi

# 定期バックアップ（backup コンテナ）が、起動直後に最初のバックアップを取る。取れたか確認する（失敗してもデプロイ自体は止めない）
echo ""
echo "=== 定期バックアップ（backup コンテナ）の確認 ==="
i=0; PERIODIC=""
while [ "$i" -le "${BACKUP_CHECK_WAIT:-90}" ]; do
    PERIODIC="$(find "$BACKUP_DIR" -maxdepth 1 -name 'periodic-db-*.sql.gz' -mmin -10 2>/dev/null | sort | tail -1)"
    [ -n "$PERIODIC" ] && break
    [ "${BACKUP_CHECK_WAIT:-90}" -eq 0 ] && break
    i=$((i + 3)); sleep 3
done
if [ -n "$PERIODIC" ]; then
    echo "[OK]    ${PERIODIC}（以後、数時間ごとに自動で取ります。ホストのディレクトリなので、コンテナやボリュームを消しても残ります）"
else
    echo "[WARN] 定期バックアップがまだ取れていません。ログを確認してください: $COMPOSE logs --tail=30 backup"
fi

echo ""
echo "=== デプロイ完了 ==="
echo "アクセス URL: http://$(hostname -I | awk '{print $1}'):4000"
if [ "${HAS_DATA:-0}" = "1" ] && [ "$SKIP_BACKUP" != "1" ]; then
    echo ""
    echo "バックアップ: $BACKUP_DIR/  （最新 $KEEP_BACKUPS 世代を保持）"
    echo "DB を復元する場合:"
    echo "  gunzip -c $BACKUP_DIR/db-$TS.sql.gz | $COMPOSE exec -T db psql -U $PGUSER -d $PGDB"
fi
