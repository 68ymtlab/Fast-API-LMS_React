#!/bin/sh
# 本物のスタック（db / backend / frontend / nginx）を一時プロジェクトで立てて通しで確認する。数分かかる。
#   - NextAuth 経由・直接 /api/login のどちらでも、ログイン試行制限が「本当のクライアントIP」で効くこと
#   - 偽の X-Forwarded-For で制限を回避できないこと
#   - 別のIPの攻撃者が、他人のメールで失敗を重ねても、本人を締め出せないこと
#   - .env を含めずにビルドした frontend / backend でも、実際にログインできること
#   - 学内の AI サーバー（LLM）に繋がらないとき、学生に「メンテナンス中」（503・code=llm_unavailable）と返ること
#     （本物の tutor・実データの知識ベースを使い、LLM の接続先だけを、繋がらない場所にする）
# 一時ディレクトリ・一時プロジェクト名（lmtest<PID>）で動かし、終了時に（そのプロジェクトだけ）片付ける。
# 既存のコンテナ・ボリューム・イメージ・.env には触れない。
#
# 画面（ブラウザ）での確認: E2E_UI=1 sh scripts/tests/e2e_stack.sh（Playwright のイメージが必要。既定では動かさない）
#   - LLM に繋がらないとき、AI チューターの画面に「メンテナンス中」のバナーが出て、入力欄が無効になること
#   - LLM が復旧すると、人手なしでバナーが消え、入力できるようになること
#   - 質問の送信が「メンテナンス中」で断られても、入力した文章が消えずに入力欄へ戻ること
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
    docker rm -f "${PROJECT}-be4" "${PROJECT}-ui" "${PROJECT}-llmstub" >/dev/null 2>&1 || true
    (cd "$T" && $COMPOSE down -v --remove-orphans >/dev/null 2>&1) || true
    # external のボリュームは down -v では消えないので、一時のものを自分で消す
    docker volume rm "$LMS_DB_VOLUME" "$LMS_UPLOADS_VOLUME" >/dev/null 2>&1 || true
    docker rmi -f "${PROJECT}-frontend" "${PROJECT}-backend" "${PROJECT}-tutor" >/dev/null 2>&1 || true
    rm -rf "$T"
}
trap cleanup EXIT

tar -C "$REPO" --exclude=node_modules --exclude=.next --exclude=.env --exclude=.venv --exclude=public/libs \
    -cf - frontend backend db nginx tutor docker-compose.yml docker-compose.prod.yml | tar -C "$T" -xf -
# 画面の確認（E2E_UI=1）では、ブラウザを動かすコンテナからも届く名前（nginx）を使い、LLM の接続先は後から起動する偽サーバー（llm-stub）にする
APP_URL="http://127.0.0.1:14000"
LLM_URL="http://127.0.0.1:9"
if [ "${E2E_UI:-}" = "1" ]; then APP_URL="http://nginx"; LLM_URL="http://llm-stub:8000"; fi

# tutor: 本物のコード・実データの知識ベースで起動する。LLM の接続先は、繋がらない場所（127.0.0.1:9）にする。
# 本番と同じく永続化（DB）が必須なので、テストでは DB の管理者でつなぐ（tutor_app ロールの作成を省くため）
cat > "$T/tutor/.env" <<ENVEOF
ANTHROPIC_BASE_URL=$LLM_URL
VLLM_MANAGER_URL=$LLM_URL
ANTHROPIC_AUTH_TOKEN=e2e-llm-token
TUTOR_SERVICE_TOKEN=e2e-tutor-token
TUTOR_DATABASE_URL=postgresql://postgres:e2epw@db:5432/lms
TUTOR_LLM_CONNECT_TIMEOUT_SEC=2
TUTOR_LLM_BREAKER_SEC=5
TUTOR_LLM_PROBE_TTL_SEC=2
ENVEOF

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
TUTOR_SERVICE_URL=http://tutor:8765
TUTOR_SERVICE_TOKEN=e2e-tutor-token
ENVEOF
cat > "$T/frontend/server/.env" <<ENVEOF
NEXT_PUBLIC_APP_BASE_URL=$APP_URL
NEXTAUTH_URL=$APP_URL
NEXT_PUBLIC_API_BASE_URL=$APP_URL
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
    build:
      args:
        HTTP_PROXY: ""
        HTTPS_PROXY: ""
        http_proxy: ""
        https_proxy: ""
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
out="$($COMPOSE --env-file frontend/server/.env up --build -d db backend frontend nginx tutor 2>&1)"; rc=$?
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

echo "- LLM（学内の AI サーバー）に繋がらないとき、学生に「メンテナンス中」と伝える（本物の tutor・nginx 経由）"
n=0
until $COMPOSE exec -T tutor curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1; do
    n=$((n + 1)); [ "$n" -ge 120 ] && break; sleep 2
done
assert_eq "tutor が起動した（LLM に繋がらなくても、起動・生存はする）" 0 "$($COMPOSE exec -T tutor curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1; echo $?)"

# 学生・管理者でログインして、トークンを得る
token_of() {
    curl -s -X POST "$BASE/api/login" --data-urlencode "username=$1" --data-urlencode "password=password" \
        | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])'
}
STUDENT_TOKEN="$(token_of okabayashi@okabayashi.com)"
ADMIN_TOKEN="$(token_of 68ymtlab@admin.com)"
# api <トークン> <METHOD> <パス> [JSON] → 「HTTPステータス|経過秒|code|本文」
api() {
    _t="$1"; _m="$2"; _p="$3"; _b="${4:-}"
    if [ -n "$_b" ]; then
        curl -s -o /tmp/e2e_body.$$ -w '%{http_code}|%{time_total}|' -X "$_m" "$BASE$_p" -H "Authorization: Bearer $_t" -H "Content-Type: application/json" -d "$_b"
    else
        curl -s -o /tmp/e2e_body.$$ -w '%{http_code}|%{time_total}|' -X "$_m" "$BASE$_p" -H "Authorization: Bearer $_t"
    fi
    python3 -c "
import json,sys
b=open('/tmp/e2e_body.$$',encoding='utf-8').read()
try: j=json.loads(b)
except Exception: j={}
print((j.get('code') or '') if isinstance(j,dict) else '', end='|'); print(b[:300].replace(chr(10),' '))"
    rm -f /tmp/e2e_body.$$
}
fld() { echo "$1" | cut -d'|' -f"$2"; }
ASK='{"text":"固有値とは何ですか"}'

r="$(api "$STUDENT_TOKEN" POST /api/tutor/open '{}')"
assert_eq "画面を開く（/api/tutor/open）は LLM を使わないので、LLM が落ちていても開ける" 200 "$(fld "$r" 1)"
r="$(api "$STUDENT_TOKEN" POST /api/tutor/message "$ASK")"
assert_eq "質問 → 503（汎用の 500 ではない）" 503 "$(fld "$r" 1)"
assert_eq "code=llm_unavailable（画面が『メンテナンス中』を出し分けられる）" llm_unavailable "$(fld "$r" 3)"
assert_contains "学生向けの文面は『メンテナンス中』" "$r" "メンテナンス中"
assert_not_contains "内部の詳細（接続先・例外名）を学生に見せない" "$r" "127.0.0.1"
r2="$(api "$STUDENT_TOKEN" POST /api/tutor/message "$ASK")"
assert_eq "2回目も 503（以降は即座に断る）" 503 "$(fld "$r2" 1)"
r="$(api "$STUDENT_TOKEN" GET /api/tutor/health)"
assert_eq "/api/tutor/health は 200" 200 "$(fld "$r" 1)"
assert_contains "health が LLM の状態を返す（画面のバナー用）" "$r" '"state":"down"'

echo "- 手動のメンテナンス（管理者が切り替える）"
r="$(api "$ADMIN_TOKEN" PUT /api/tutor/admin/settings '{"maintenance": true, "maintenance_message": "AIサーバーの点検のため 15:00〜16:00 は使えません。"}')"
assert_eq "管理者は設定できる" 200 "$(fld "$r" 1)"
r="$(api "$STUDENT_TOKEN" PUT /api/tutor/admin/settings '{"maintenance": false}')"
assert_eq "学生は設定できない（403）" 403 "$(fld "$r" 1)"
r="$(api "$STUDENT_TOKEN" POST /api/tutor/message "$ASK")"
assert_eq "メンテナンス中は 503" 503 "$(fld "$r" 1)"
assert_contains "管理者が書いた文面が、学生に出る" "$r" "15:00〜16:00"
r="$(api "$STUDENT_TOKEN" GET /api/tutor/health)"
assert_contains "health が maintenance を返す" "$r" '"state":"maintenance"'
api "$ADMIN_TOKEN" PUT /api/tutor/admin/settings '{"maintenance": false}' >/dev/null
r="$(api "$STUDENT_TOKEN" GET /api/tutor/health)"
case "$r" in *'"state":"maintenance"'*) fail "解除しても maintenance のまま";; *) ok "解除すると maintenance が外れる";; esac

echo "- tutor サービス自体が止まっているときも、『メンテナンス中』と伝える"
docker stop "${PROJECT}-tutor" >/dev/null
r="$(api "$STUDENT_TOKEN" GET /api/tutor/health)"
assert_eq "health は 200 のまま（画面が判定できる）" 200 "$(fld "$r" 1)"
assert_contains "state=tutor_down" "$r" '"state":"tutor_down"'
r="$(api "$STUDENT_TOKEN" POST /api/tutor/message "$ASK")"
assert_eq "質問 → 502" 502 "$(fld "$r" 1)"
assert_eq "code=tutor_unavailable" tutor_unavailable "$(fld "$r" 3)"
assert_contains "文面は『メンテナンス中』" "$r" "メンテナンス中"
docker start "${PROJECT}-tutor" >/dev/null

if [ "${E2E_UI:-}" = "1" ]; then
echo "- 画面（ブラウザ）で確認する: メンテナンス表示・自動復旧・送信失敗時の入力の復元"
n=0
until $COMPOSE exec -T tutor curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1; do
    n=$((n + 1)); [ "$n" -ge 60 ] && break; sleep 2
done
UIDIR="$T/ui-out"; mkdir -p "$UIDIR"; chmod 777 "$UIDIR"
# LLM ゲートウェイの偽サーバー（GET /v1/models に 200）。最初は起動しない（= LLM が落ちている）
cat > "$T/stub.py" <<'PY'
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'{"data":[{"id":"stub"}]}'
        self.send_response(200); self.send_header("Content-Type","application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
HTTPServer(("0.0.0.0", 8000), H).serve_forever()
PY
cat > "$UIDIR/check.js" <<'JS'
const { chromium } = require("playwright");
const fs = require("fs");
const waitFile = async (f, ms) => { const t = Date.now(); while (!fs.existsSync(f)) { if (Date.now() - t > ms) throw new Error("待ち合わせ失敗: " + f); await new Promise(r => setTimeout(r, 500)); } };
(async () => {
  const out = {};
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", e => { out.pageerror = (out.pageerror || "") + String(e).slice(0, 200) + " | "; });
  await page.goto("http://nginx/login");
  await page.getByPlaceholder("メールアドレス").fill("okabayashi@okabayashi.com");
  await page.getByPlaceholder("パスワード").fill("password");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith("/login"), { timeout: 60000 });
  await page.goto("http://nginx/tutor");
  const box = page.locator("textarea");
  const banner = page.locator("output");
  // (1) LLM が落ちている: バナーが出て、入力欄が無効
  await banner.first().waitFor({ timeout: 60000 });
  out.banner1 = (await banner.first().innerText()).replace(/\s+/g, " ");
  out.disabled1 = await box.isDisabled();
  out.placeholder1 = await box.getAttribute("placeholder");
  await page.screenshot({ path: "/out/1-maintenance.png" });
  fs.writeFileSync("/out/ready1", "1");
  // (2) LLM が復旧: 人手なしでバナーが消え、入力欄が有効になる
  await banner.first().waitFor({ state: "detached", timeout: 150000 });
  out.recovered = true;
  await page.waitForFunction(() => { const t = document.querySelector("textarea"); return t && !t.disabled; }, null, { timeout: 30000 });
  out.enabled2 = await box.isEnabled();
  await page.screenshot({ path: "/out/2-recovered.png" });
  fs.writeFileSync("/out/ready2", "1");
  await waitFile("/out/go3", 60000);
  // (3) 送信が「メンテナンス中」で断られても、入力した文章が消えずに戻る
  const q = "固有値とは何ですか";
  await box.fill(q);
  await box.press("Enter");
  await banner.first().waitFor({ timeout: 60000 });
  out.banner3 = (await banner.first().innerText()).replace(/\s+/g, " ");
  out.restoredText = await box.inputValue();
  out.disabled3 = await box.isDisabled();
  // 会話に質問が残っていないこと。入力欄（textarea）の中身は数えない（戻した文章が入っているのが正しい）
  out.studentBubbleLeft = await page.evaluate((text) => [...document.querySelectorAll("body *")].filter((e) => !["TEXTAREA", "INPUT", "SCRIPT", "STYLE"].includes(e.tagName) && e.children.length === 0 && e.textContent.trim() === text).length, q);
  await page.screenshot({ path: "/out/3-send-failed.png" });
  fs.writeFileSync("/out/result.json", JSON.stringify(out));
  await browser.close();
})().catch(e => { fs.writeFileSync("/out/result.json", JSON.stringify({ error: String(e).slice(0, 400) })); process.exit(1); });
JS
docker run -d --name "${PROJECT}-ui" --network "${PROJECT}_default" -v "$UIDIR:/out" -w /out mcr.microsoft.com/playwright:v1.50.0-noble \
    sh -c 'npm init -y >/dev/null 2>&1; npm i playwright@1.50.0 >/dev/null 2>&1; node /out/check.js' >/dev/null
waitf() { _n=0; while [ ! -f "$1" ] && [ "$_n" -lt "$2" ]; do _n=$((_n + 1)); sleep 1; done; [ -f "$1" ]; }
waitf "$UIDIR/ready1" 240 && ok "ブラウザでメンテナンス表示を確認した" || fail "ブラウザのテストが進まない: $(docker logs "${PROJECT}-ui" 2>&1 | tail -3 | tr '\n' ' ') $(cat "$UIDIR/result.json" 2>/dev/null)"
# LLM が復旧する（偽サーバーを起動）。以降、tutor の疎通確認が成功すると、画面のバナーが自動で消える
docker run -d --name "${PROJECT}-llmstub" --network "${PROJECT}_default" --network-alias llm-stub -v "$T/stub.py:/s.py:ro" python:3.12-slim python /s.py >/dev/null
waitf "$UIDIR/ready2" 200 && ok "LLM の復旧後、バナーが自動で消えた" || fail "バナーが消えない"
# また LLM が落ちる。画面は復旧済みと思っているので、質問を送ると断られる
docker rm -f "${PROJECT}-llmstub" >/dev/null 2>&1
touch "$UIDIR/go3"
waitf "$UIDIR/result.json" 120 || fail "結果が出ない"
res="$(cat "$UIDIR/result.json" 2>/dev/null)"
docker rm -f "${PROJECT}-ui" >/dev/null 2>&1
uj() { printf '%s' "$res" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1', ''))"; }
assert_eq "（エラーなし）" "" "$(uj error)$(uj pageerror)"
assert_contains "(1) バナーに『メンテナンス中』" "$(uj banner1)" "メンテナンス中"
assert_eq "(1) 入力欄は無効" True "$(uj disabled1)"
assert_contains "(1) 入力欄に『メンテナンス中』と表示" "$(uj placeholder1)" "メンテナンス中"
assert_eq "(2) 復旧後、入力欄が有効" True "$(uj enabled2)"
assert_contains "(3) 送信が断られると、バナーが出る" "$(uj banner3)" "メンテナンス中"
assert_eq "(3) 質問の文章が、入力欄に戻っている" "固有値とは何ですか" "$(uj restoredText)"
assert_eq "(3) 送信した質問が、会話に残っていない（取り消された）" 0 "$(uj studentBubbleLeft)"
assert_eq "(3) 入力欄は無効" True "$(uj disabled3)"
echo "    スクリーンショット: $UIDIR/*.png（この実行の終了時に消えます。残すなら E2E_KEEP_UI=\"保存先\"）"
[ -n "${E2E_KEEP_UI:-}" ] && { mkdir -p "$E2E_KEEP_UI" && cp "$UIDIR"/*.png "$E2E_KEEP_UI"/ && echo "    → $E2E_KEEP_UI に保存しました"; }
fi

echo "- イメージに .env が入っていない"
# 本番の backend は bind mount でホストのディレクトリが見えることがあるので、コンテナではなく「イメージ」を直接調べる
fe="$(docker run --rm --entrypoint "" "${PROJECT}-frontend" sh -c 'ls -A /app')"
case "$fe" in *.env*) fail "frontend イメージに .env がある: $fe";; *) ok "frontend イメージに .env が無い";; esac
be="$(docker run --rm --entrypoint "" "${PROJECT}-backend" sh -c 'ls -A /src/backend')"
case "$be" in *.env*) fail "backend イメージに .env がある: $be";; *) ok "backend イメージに .env が無い";; esac

finish
