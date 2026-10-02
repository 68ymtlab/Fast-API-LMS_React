#!/bin/sh
# 本物のスタック（db / backend / frontend / nginx）を一時プロジェクトで立てて通しで確認する。数分かかる。
#   - NextAuth 経由・直接 /api/login のどちらでも、ログイン試行制限が「本当のクライアントIP」で効くこと
#   - 偽の X-Forwarded-For で制限を回避できないこと
#   - 別のIPの攻撃者が、他人のメールで失敗を重ねても、本人を締め出せないこと
#   - .env を含めずにビルドした frontend / backend でも、実際にログインできること
# 一時ディレクトリ・一時プロジェクト名（lmtest<PID>）で動かし、終了時に（そのプロジェクトだけ）片付ける。
# 既存のコンテナ・ボリューム・イメージ・.env には触れない。
#
# 注: backend は本番の構成（bind mount なし・--reload なし・Dockerfile の CMD）で起動する。ワーカー数は本番の既定が 4 だが、
#     ログイン試行制限のカウンタがワーカーごとで判定が揺れるため、制限のテストの間だけ WEB_CONCURRENCY=1 にしている。
#     4 ワーカーでの起動は別途確認する（「本番の既定のワーカー数で起動する」の項）。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

SUF="$$"
PROJECT="lmtest${SUF}"
# 本番用の compose は DB・アップロードのボリュームを external（実際の本番・開発と同じ名前）で参照する。
# テストでは必ず一時の名前に差し替える（実際のボリュームに接続して、データを書き換えてしまわないように）
export LMS_DB_VOLUME="${PROJECT}-postgres-data"
export LMS_UPLOADS_VOLUME="${PROJECT}-uploads-data"
T="$(mktemp -d)"
COMPOSE="docker compose -p $PROJECT -f docker-compose.yml -f docker-compose.prod.yml -f test-override.yml"

cleanup() {
    docker rm -f "${PROJECT}-be4" >/dev/null 2>&1 || true
    (cd "$T" && $COMPOSE down -v --remove-orphans >/dev/null 2>&1) || true
    # external のボリュームは down -v では消えないので、一時のものを自分で消す
    docker volume rm "$LMS_DB_VOLUME" "$LMS_UPLOADS_VOLUME" >/dev/null 2>&1 || true
    docker rmi -f "${PROJECT}-frontend" "${PROJECT}-backend" >/dev/null 2>&1 || true
    rm -rf "$T"
}
trap cleanup EXIT

tar -C "$REPO" --exclude=node_modules --exclude=.next --exclude=.env --exclude=.venv --exclude=public/libs \
    -cf - frontend backend db nginx docker-compose.yml docker-compose.prod.yml | tar -C "$T" -xf -
mkdir -p "$T/tutor"
: > "$T/tutor/.env"   # tutor は起動しない。compose が env_file の存在を確認するためのダミー

cat > "$T/db/.env" <<'ENVEOF'
POSTGRES_USER=postgres
POSTGRES_PASSWORD=e2epw
POSTGRES_DB=lms
ENVEOF
cat > "$T/backend/.env" <<'ENVEOF'
DATABASE_URL=postgresql+asyncpg://postgres:e2epw@db:5432/lms
SECRET_KEY=e2e-secret-key-for-test-only-0123456789abcdef0123456789
COOKIE_SECURE=False
ALLOWED_ORIGINS=http://127.0.0.1
ENVEOF
cat > "$T/frontend/server/.env" <<'ENVEOF'
NEXT_PUBLIC_APP_BASE_URL=http://127.0.0.1:14000
NEXTAUTH_URL=http://127.0.0.1:14000
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:14000
INTERNAL_API_BASE_URL=http://backend:8000
NEXTAUTH_SECRET=e2e-nextauth-secret-for-test-only-0123456789
NEXT_PUBLIC_DISABLE_AUTH_CHECK=false
NEXT_PUBLIC_MAINTENANCE_MODE=false
NEXT_PUBLIC_DEBUG_LEVEL=0
ENVEOF

# 既存のスタックと衝突しないようにする（コンテナ名・ポート・ネットワーク）／学内プロキシの既定値を空にする／backend は 1 ワーカー
cat > "$T/test-override.yml" <<YML
services:
  db:
    container_name: ${PROJECT}-db
  backend:
    container_name: ${PROJECT}-backend
    environment:
      - WEB_CONCURRENCY=1
    build:
      args:
        HTTP_PROXY: ""
        HTTPS_PROXY: ""
        http_proxy: ""
        https_proxy: ""
  frontend:
    build:
      args:
        HTTP_PROXY: ""
        HTTPS_PROXY: ""
        http_proxy: ""
        https_proxy: ""
  tutor:
    container_name: ${PROJECT}-tutor
  nginx:
    ports: !override
      - "127.0.0.1::80"
networks:
  default:
    ipam: !reset {}
YML

cd "$T" || exit 1
# external のボリュームは compose が作らない（本番では deploy.sh が初回に作る）。一時の名前で作る
docker volume create "$LMS_DB_VOLUME" >/dev/null
docker volume create "$LMS_UPLOADS_VOLUME" >/dev/null
echo "- スタックをビルドして起動（backend / frontend は .env を含まない構成）"
out="$($COMPOSE --env-file frontend/server/.env up --build -d db backend frontend nginx 2>&1)"; rc=$?
assert_eq "起動コマンドが成功" 0 "$rc"
[ "$rc" -ne 0 ] && { echo "$out" | tail -20; finish; exit 1; }

PORT="$($COMPOSE port nginx 80 | head -1 | sed 's/.*://')"
BASE="http://127.0.0.1:$PORT"
n=0
until [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/login" 2>/dev/null)" = "200" ]; do
    n=$((n + 1)); [ "$n" -ge 150 ] && break; sleep 1
done
assert_eq "ログイン画面が nginx 経由で表示される" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/login")"

$COMPOSE exec -T backend poetry run python scripts/seed_users.py >/dev/null 2>&1
assert_eq "テスト用ユーザーを投入できた" 0 "$?"

# ---- ヘルパ ----
# 直接 /api/login を叩いて HTTP ステータスを返す: api_login <email> <password> [X-Forwarded-For]
api_login() {
    if [ -n "${3:-}" ]; then
        curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/login" -H "X-Forwarded-For: $3" \
            --data-urlencode "username=$1" --data-urlencode "password=$2"
    else
        curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/login" \
            --data-urlencode "username=$1" --data-urlencode "password=$2"
    fi
}
# NextAuth（frontend）経由でログインし、セッションに user が入れば OK を返す: nextauth_login <email> <password> [X-Forwarded-For]
nextauth_login() {
    jar="$(mktemp)"
    csrf="$(curl -s -c "$jar" "$BASE/api/auth/csrf" | python3 -c 'import sys,json; print(json.load(sys.stdin)["csrfToken"])')"
    if [ -n "${3:-}" ]; then xff="X-Forwarded-For: $3"; else xff="X-Dummy: 1"; fi
    curl -s -o /dev/null -b "$jar" -c "$jar" -X POST "$BASE/api/auth/callback/credentials" -H "$xff" \
        --data-urlencode "csrfToken=$csrf" --data-urlencode "username=$1" --data-urlencode "password=$2" --data-urlencode "json=true"
    sess="$(curl -s -b "$jar" "$BASE/api/auth/session")"
    rm -f "$jar"
    case "$sess" in *"$1"*) echo OK ;; *) echo FAIL ;; esac
}

ADMIN="68ymtlab@admin.com"

echo "- 正しいパスワードで、NextAuth 経由のログインができる（.env 無しのイメージで実際に動く）"
assert_eq "セッションにユーザーが入る" OK "$(nextauth_login "$ADMIN" password)"
assert_eq "直接 /api/login も 200" 200 "$(api_login "$ADMIN" password)"

echo "- 直接 /api/login: 偽の X-Forwarded-For を毎回変えても、10回失敗でロックされる"
i=1; locked_before_10=0
while [ "$i" -le 9 ]; do
    [ "$(api_login ohno@ohno.com wrong "203.0.113.$i")" = "429" ] && locked_before_10=1
    i=$((i + 1))
done
assert_eq "9回目まではロックされない" 0 "$locked_before_10"
assert_eq "10回目は 401（失敗として数えられる）" 401 "$(api_login ohno@ohno.com wrong 198.51.100.77)"
assert_eq "11回目は偽のIPを変えても 429（回避できない）" 429 "$(api_login ohno@ohno.com wrong 192.0.2.200)"
assert_eq "正しいパスワードでもロック中は 429" 429 "$(api_login ohno@ohno.com password 192.0.2.201)"
assert_eq "別のメールは影響を受けない" 200 "$(api_login okabayashi@okabayashi.com password)"

echo "- NextAuth 経由の失敗も、本当のIPで数えられる（直接 /api/login とキーが一致する）"
i=1
while [ "$i" -le 10 ]; do nextauth_login neo@neo.com wrong "203.0.113.$i" >/dev/null; i=$((i + 1)); done
assert_eq "NextAuth で10回失敗 → 直接 /api/login が 429" 429 "$(api_login neo@neo.com password)"

echo "- 別のIPの攻撃者は、他人のメールで失敗を重ねても、本人を締め出せない"
VICTIM="yanagi@yanagi.com"
attack="$(docker run --rm -i --network "${PROJECT}_default" python:3.12-slim python - <<'PY'
import urllib.request, urllib.parse, urllib.error
codes = []
for _ in range(12):
    data = urllib.parse.urlencode({"username": "yanagi@yanagi.com", "password": "wrong"}).encode()
    req = urllib.request.Request("http://nginx/api/login", data=data)
    try:
        codes.append(urllib.request.urlopen(req, timeout=10).status)
    except urllib.error.HTTPError as e:
        codes.append(e.code)
print(" ".join(map(str, codes)))
PY
)"
case "$attack" in *429*) ok "攻撃者のIPはロックされた（${attack}）";; *) fail "攻撃者がロックされていない: $attack";; esac
assert_eq "本人（別のIP）は NextAuth で普通にログインできる" OK "$(nextauth_login "$VICTIM" password)"

echo "- backend が本番の構成で動いている（開発用の設定が残っていない）"
BE_CTR="${PROJECT}-backend"
cmd="$(docker inspect --format '{{json .Config.Cmd}}' "$BE_CTR")"
assert_not_contains "--reload で動いていない" "$cmd" "--reload"
bindmounts="$(docker inspect --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Destination}} {{end}}{{end}}' "$BE_CTR")"
assert_eq "ホストのディレクトリを bind mount していない" "" "$(echo "$bindmounts" | tr -d ' ')"
venvvol="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/src/backend/.venv"}}anon{{end}}{{end}}' "$BE_CTR")"
assert_eq ".venv の匿名ボリュームが無い" "" "$venvvol"
upvol="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/uploads"}}{{.Name}}{{end}}{{end}}' "$BE_CTR")"
assert_eq "uploads は名前付きボリューム（external）" "$LMS_UPLOADS_VOLUME" "$upvol"
# コンテナ内のコードがホストのファイルではなく、イメージのものである（テスト用に作ったホストの backend/ の目印が見えない）
inimg="$(docker exec "$BE_CTR" sh -c 'ls -A /src/backend | tr "\n" " "')"
assert_not_contains "コンテナ内に開発用の .venv（ホストのもの）や .env が無い" "$inimg" ".env"

echo "- 画像の表示（bind mount を外しても、旧形式・新形式の両方の画像が表示できる）"
# 新形式: アップロード画像は /app/uploads/images/... に絶対パスで保存・登録される（名前付きボリューム）
docker exec "$BE_CTR" sh -c 'mkdir -p /app/uploads/images/9 && printf NEWIMAGE > /app/uploads/images/9/new.png'
new_id="$($COMPOSE exec -T db psql -U postgres -d lms -tAc "INSERT INTO images (file_path, alt_text, original_name) VALUES ('/app/uploads/images/9/new.png','a','new.png') RETURNING id" | head -1 | tr -d '[:space:]')"
assert_eq "新形式の画像が表示できる" "NEWIMAGE" "$(curl -s "$BASE/api/images/$new_id")"
# 旧形式: DB には ./static/images/... で登録されている。ホストの backend/static/images/ にあったファイル
legacy_id="$($COMPOSE exec -T db psql -U postgres -d lms -tAc "INSERT INTO images (file_path, alt_text, original_name) VALUES ('./static/images/legacy-e2e.png','a','legacy.png') RETURNING id" | head -1 | tr -d '[:space:]')"
assert_eq "移行前: bind mount が無いので旧形式の画像は見つからない（404）" 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/images/$legacy_id")"
mkdir -p "$T/scripts" "$T/backend/static/images"
cp "$REPO/scripts/migrate_legacy_images.sh" "$T/scripts/"
printf LEGACYIMAGE > "$T/backend/static/images/legacy-e2e.png"
sh "$T/scripts/migrate_legacy_images.sh" "$LMS_UPLOADS_VOLUME" >/dev/null 2>&1
assert_eq "migrate_legacy_images.sh が成功" 0 "$?"
assert_eq "移行後: 旧形式の画像が表示できる" "LEGACYIMAGE" "$(curl -s "$BASE/api/images/$legacy_id")"

echo "- 本番の既定のワーカー数（4）でも起動する"
docker run -d --name "${PROJECT}-be4" --network "${PROJECT}_default" \
    -e SECRET_KEY=e2e -e DATABASE_URL=postgresql+asyncpg://postgres:e2epw@db:5432/lms "${PROJECT}-backend" >/dev/null
n=0
until docker exec "${PROJECT}-be4" python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/', timeout=3)" >/dev/null 2>&1; do
    n=$((n + 1)); [ "$n" -ge 60 ] && break; sleep 1
done
assert_eq "起動して / に 200 を返す" 0 "$(docker exec "${PROJECT}-be4" python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/', timeout=3)" >/dev/null 2>&1; echo $?)"
workers="$(docker logs "${PROJECT}-be4" 2>&1 | grep -c 'Started server process')"
assert_eq "ワーカーが4つ起動した（WEB_CONCURRENCY の既定）" 4 "$workers"
docker rm -f "${PROJECT}-be4" >/dev/null 2>&1

echo "- イメージに .env が入っていない"
# 本番の backend は bind mount でホストのディレクトリが見えることがあるので、コンテナではなく「イメージ」を直接調べる
fe="$(docker run --rm --entrypoint "" "${PROJECT}-frontend" sh -c 'ls -A /app')"
case "$fe" in *.env*) fail "frontend イメージに .env がある: $fe";; *) ok "frontend イメージに .env が無い";; esac
be="$(docker run --rm --entrypoint "" "${PROJECT}-backend" sh -c 'ls -A /src/backend')"
case "$be" in *.env*) fail "backend イメージに .env がある: $be";; *) ok "backend イメージに .env が無い";; esac

finish
