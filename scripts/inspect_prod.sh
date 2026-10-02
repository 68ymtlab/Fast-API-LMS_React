#!/bin/sh
# 本番サーバーの「実際の」稼働状態を、読み取り専用で確認する（何も変更しない）。
# デプロイ前に実行し、WARN の内容を確認する。
#
# 使い方:
#   ./scripts/inspect_prod.sh
#
# 環境変数:
#   BACKEND_CONTAINER / DB_CONTAINER   対象コンテナ名（既定 react-fastapi-demo / lms-db）
#
# 確認すること:
#   - compose のバージョン（!reset / !override に v2.24 以上が必要）
#   - backend が本番用の構成で動いているか
#       docker-compose.prod.yml は開発用の設定（--reload・ホストのソースの bind mount・.venv の匿名ボリューム）を
#       打ち消す意図だが、compose の volumes は「上書き」ではなく「マージ」されるため、残っていることがある
#   - 稼働中の backend の .venv に、今のコードが必要とするライブラリ（httpx など）があるか
#   - 旧形式の画像（./static/...）がホスト側に残っていないか
#   - DB のバージョン

BACKEND="${BACKEND_CONTAINER:-react-fastapi-demo}"
DB="${DB_CONTAINER:-lms-db}"
WARNINGS=0

cd "$(dirname "$0")/.." || exit 1

ok()   { echo "  [OK]   $1"; }
warn() { echo "  [WARN] $1"; WARNINGS=$((WARNINGS + 1)); }
info() { echo "  [INFO] $1"; }

echo "=== Docker / Compose"
info "docker: $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo 不明)"
CV="$(docker compose version --short 2>/dev/null || echo 不明)"
info "compose: $CV"
case "$CV" in
    v2.2[0-3].*|2.2[0-3].*|v1.*|1.*) warn "compose が古い可能性があります（v2.24 以上が必要: docker-compose.prod.yml の !reset / !override）";;
    不明) warn "compose のバージョンを取得できません";;
    *) ok "compose のバージョン";;
esac

echo ""
echo "=== コンテナ"
docker ps --format '    {{.Names}}  {{.Status}}  ({{.Image}})' 2>/dev/null | sed -n '1,20p'

echo ""
echo "=== backend ($BACKEND) の実際の構成"
if ! docker inspect "$BACKEND" >/dev/null 2>&1; then
    warn "$BACKEND コンテナが見つかりません（BACKEND_CONTAINER で名前を指定できます）"
else
    CMD="$(docker inspect --format '{{json .Config.Cmd}}' "$BACKEND")"
    info "起動コマンド: $CMD"
    case "$CMD" in
        *--reload*) warn "--reload で動いています（開発用の設定）。ファイルが変わるとその場で再起動し、git pull だけで本番のコードが入れ替わります";;
        *) ok "--reload ではない";;
    esac
    WC="$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$BACKEND" | sed -n 's/^WEB_CONCURRENCY=//p' | head -1)"
    case "$CMD" in
        *--reload*) ;;  # 上で警告済み（reload のときワーカー数は無視される）
        *) if [ -n "$WC" ]; then ok "ワーカー数 WEB_CONCURRENCY=${WC}（Dockerfile の既定は 4）"; else info "WEB_CONCURRENCY の指定なし（1プロセス）。最新の Dockerfile では既定 4"; fi;;
    esac

    BIND="$(docker inspect --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}} -> {{.Destination}}{{println}}{{end}}{{end}}' "$BACKEND" | sed '/^$/d')"
    if [ -n "$BIND" ]; then
        warn "ホストのディレクトリが bind mount されています（イメージ内のコードではなく、ホストのファイルが使われます）:"
        echo "$BIND" | sed 's/^/           /'
    else
        ok "bind mount なし（イメージ内のコードで動いている）"
    fi

    ANON="$(docker inspect --format '{{range .Mounts}}{{if and (eq .Type "volume") (eq .Destination "/src/backend/.venv")}}{{.Name}}{{end}}{{end}}' "$BACKEND")"
    if [ -n "$ANON" ]; then
        warn ".venv が匿名ボリューム（$(echo "$ANON" | cut -c1-12)…）です。再デプロイしても古いまま残り、新しい依存が使われません（deploy.sh は --renew-anon-volumes で作り直します）"
    else
        ok ".venv は匿名ボリュームではない"
    fi

    echo ""
    echo "=== backend の .venv に必要なライブラリがあるか"
    for mod in httpx sqlalchemy greenlet asyncpg jose; do
        if docker exec "$BACKEND" sh -c "cd /src/backend && poetry run python -c 'import $mod' " >/dev/null 2>&1; then
            ok "$mod を import できる"
        else
            warn "$mod を import できません（このまま最新のコードに切り替えると backend が起動しません）"
        fi
    done
    info "sqlalchemy: $(docker exec "$BACKEND" sh -c "cd /src/backend && poetry run python -c 'import sqlalchemy; print(sqlalchemy.__version__)'" 2>/dev/null || echo 不明)"
fi

echo ""
echo "=== 誤ってコンテナ・ボリュームを消しても、データが残る備え"
if [ -f .env ] && grep -q '^COMPOSE_FILE=.*docker-compose.prod.yml' .env; then
    ok ".env の COMPOSE_FILE で、素の docker compose も本番用の設定を読む（-f なしの down -v でもボリュームは消えない）"
else
    warn ".env に COMPOSE_FILE がありません。-f を付けずに docker compose down -v すると、DB・アップロードのボリュームが消えます（deploy.sh を実行すると設定されます）"
fi
EXT="$(docker compose config 2>/dev/null | awk '/^volumes:/{f=1;next} f&&/^  postgres-data:/{p=1;next} p&&/external:/{print $2; exit} p&&/^  [a-z]/{exit}')"
if [ "$EXT" = "true" ]; then ok "DB のボリュームは external（down -v では消えない。無いときは空のDBを作らず起動に失敗する）"; else warn "DB のボリュームが external になっていません（docker compose down -v で消えます）"; fi
BSTATE="$(docker ps -a --filter 'name=backup' --format '{{.Names}}: {{.Status}}' 2>/dev/null | grep -i 'backup' | head -1)"
if [ -n "$BSTATE" ]; then info "backup コンテナ: $BSTATE"; else warn "backup コンテナがありません（定期バックアップが動いていません。deploy.sh で起動します）"; fi
NEWEST="$(ls -1t db/backups/periodic-db-*.sql.gz 2>/dev/null | head -1)"
if [ -n "$NEWEST" ]; then
    AGE_MIN=$(( ( $(date +%s) - $(stat -c %Y "$NEWEST" 2>/dev/null || stat -f %m "$NEWEST") ) / 60 ))
    if [ "$AGE_MIN" -le 600 ]; then ok "定期バックアップ（ホストの db/backups/）: $(basename "$NEWEST")（${AGE_MIN} 分前、$(du -h "$NEWEST" | cut -f1)）"; else warn "最新の定期バックアップが古い: $(basename "$NEWEST")（${AGE_MIN} 分前）。backup コンテナのログを確認してください"; fi
    info "定期バックアップの個数: DB $(ls db/backups/periodic-db-*.sql.gz 2>/dev/null | wc -l | tr -d ' ') / アップロード $(ls db/backups/periodic-uploads-*.tar.gz 2>/dev/null | wc -l | tr -d ' ')"
else
    warn "定期バックアップ（db/backups/periodic-db-*.sql.gz）がまだありません"
fi
[ -f db/backups/.periodic-status ] && info "backup の最新の結果: $(tr '\n' ' ' < db/backups/.periodic-status)"
if [ -d db/backups ]; then
    PERM="$(stat -c '%a' db/backups 2>/dev/null || stat -f '%Lp' db/backups)"
    [ "$PERM" = "700" ] && ok "db/backups の権限は 700（個人情報を含むバックアップを、本人だけが読める）" || warn "db/backups の権限が ${PERM} です（chmod 700 db/backups を推奨）"
fi

echo ""
echo "=== 旧形式の画像（./static/...）"
HOSTIMG="$(find backend/static/images -type f ! -name '.gitkeep' 2>/dev/null | wc -l | tr -d ' ')"
info "ホストの backend/static/images のファイル数: ${HOSTIMG:-0}"
if docker inspect "$DB" >/dev/null 2>&1; then
    LEGACY="$(docker exec "$DB" sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -tAc "SELECT count(*) FROM images WHERE file_path LIKE '"'"'./static/%'"'"' OR file_path LIKE '"'"'static/%'"'"'"' 2>/dev/null | tr -d '[:space:]')"
    info "DB に ./static/... の画像として登録されている件数: ${LEGACY:-不明}"
    if [ "${HOSTIMG:-0}" != "0" ] || { [ -n "${LEGACY:-}" ] && [ "$LEGACY" != "0" ]; }; then
        warn "旧形式の画像があります。backend の bind mount を外す前に、画像を uploads ボリュームの static/images/ へ移す必要があります（docs/ops/deploy-checklist.md）"
    else
        ok "旧形式の画像なし"
    fi

    echo ""
    echo "=== DB ($DB)"
    info "$(docker exec "$DB" sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -tAc "select version()"' 2>/dev/null | cut -c1-70)"
    DBV="$(docker exec "$DB" sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -tAc "show server_version"' 2>/dev/null | tr -d '[:space:]')"
    case "$DBV" in 16.*) ok "PostgreSQL 16 系";; *) warn "PostgreSQL 16 ではありません（${DBV:-不明}）。compose は postgres:16-alpine です";; esac
else
    warn "$DB コンテナが見つかりません"
fi

echo ""
if [ "$WARNINGS" -eq 0 ]; then
    echo "WARN なし。"
else
    echo "WARN が ${WARNINGS} 件あります。内容を確認してからデプロイしてください。"
fi
exit 0
