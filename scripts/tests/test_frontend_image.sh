#!/bin/sh
# frontend イメージのビルドのテスト（本物の docker compose / BuildKit を使う。数分かかる）。
#   - .env がイメージに入らないこと
#   - NEXT_PUBLIC_* が、deploy.sh と同じ `--env-file frontend/server/.env` 経由でバンドルに焼き込まれること
#   - --env-file を付け忘れたら、壊れた画面を作らずビルドが失敗すること
# 一時ディレクトリにリポジトリの一部をコピーして行い、実際の .env や既存のイメージ・タグには触れない。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

SUF="$$"
PROJECT="lmtest${SUF}"
T="$(mktemp -d)"
cleanup() {
    docker rmi -f "${PROJECT}-frontend" >/dev/null 2>&1 || true
    rm -rf "$T"
}
trap cleanup EXIT

tar -C "$REPO" --exclude=node_modules --exclude=.next --exclude=.env --exclude=public/libs \
    -cf - frontend docker-compose.yml docker-compose.prod.yml | tar -C "$T" -xf -
mkdir -p "$T/backend" "$T/db" "$T/tutor"
: > "$T/backend/.env"; : > "$T/db/.env"; : > "$T/tutor/.env"   # compose が env_file の存在を確認するためのダミー

URL="http://from-env-file-${SUF}.test:4000"
cat > "$T/frontend/server/.env" <<ENVEOF
NEXT_PUBLIC_API_BASE_URL=$URL
NEXT_PUBLIC_APP_BASE_URL=$URL
NEXTAUTH_URL=$URL
NEXT_PUBLIC_MAINTENANCE_MODE=false
NEXT_PUBLIC_DEBUG_LEVEL=0
NEXT_PUBLIC_DISABLE_AUTH_CHECK=false
NEXTAUTH_SECRET=DECOY_SECRET_MARKER_${SUF}
ENVEOF
# テスト環境では学内プロキシが無いので、proxy の既定値を空に上書きする
cat > "$T/test-override.yml" <<'YML'
services:
  frontend:
    build:
      args:
        HTTP_PROXY: ""
        HTTPS_PROXY: ""
        http_proxy: ""
        https_proxy: ""
YML

COMPOSE="docker compose -p $PROJECT -f docker-compose.yml -f docker-compose.prod.yml -f test-override.yml"
cd "$T" || exit 1

echo "- --env-file を付け忘れた場合は、ビルドが失敗する"
out="$($COMPOSE build frontend 2>&1)"; rc=$?
assert_eq "終了コード（失敗する）" 1 "$([ "$rc" -ne 0 ] && echo 1 || echo 0)"
assert_contains "分かりやすいエラーを出す" "$out" "frontend/server/.env の値が渡されていません"

echo "- --env-file を付けた場合（deploy.sh と同じ）"
out="$($COMPOSE --env-file frontend/server/.env build frontend 2>&1)"; rc=$?
assert_eq "ビルド成功" 0 "$rc"
[ "$rc" -ne 0 ] && { echo "$out" | tail -15; finish; exit 1; }

IMG="${PROJECT}-frontend"
files="$(docker run --rm --entrypoint "" "$IMG" sh -c 'ls -A /app')"
case "$files" in *.env*) fail ".env がイメージに入っている: $files";; *) ok ".env がイメージに入っていない";; esac
found="$(docker run --rm --entrypoint "" "$IMG" sh -c 'find / -name ".env*" -not -path "/proc/*" -not -path "/sys/*" -not -path "*/node_modules/*" 2>/dev/null | head -3')"
assert_eq "イメージ内のどこにも .env が無い" "" "$found"
n="$(docker run --rm --entrypoint "" "$IMG" sh -c "grep -rl '$URL' /app/.next/static | wc -l" | tr -d ' ')"
[ "$n" -gt 0 ] && ok "バンドルに --env-file の URL が焼き込まれた（${n} ファイル）" || fail "バンドルに URL が無い"
m="$(docker run --rm --entrypoint "" "$IMG" sh -c "grep -rl 'DECOY_SECRET_MARKER_${SUF}' /app 2>/dev/null | wc -l" | tr -d ' ')"
assert_eq "NEXTAUTH_SECRET など .env の秘密がイメージに入っていない" 0 "$m"
hist="$(docker history --no-trunc "$IMG" 2>/dev/null | grep -c "DECOY_SECRET_MARKER_${SUF}" || true)"
assert_eq "イメージの履歴（レイヤー）にも残っていない" 0 "$hist"

finish
