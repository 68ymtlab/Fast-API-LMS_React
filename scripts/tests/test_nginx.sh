#!/bin/sh
# nginx.conf のテスト（本物の nginx コンテナを使う）。
# クライアントが偽の X-Forwarded-For を付けても、upstream（backend / frontend）には
# 「nginx が実際に見たクライアントIP 1個」だけが渡ること（ログイン試行制限の回避を防ぐ）を確認する。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

SUF="$$"
NET="nginxtest-net-$SUF"
BE="nginxtest-be-$SUF"
FE="nginxtest-fe-$SUF"
NG="nginxtest-ng-$SUF"
SCRIPT="$(mktemp)"

cleanup() {
    docker rm -f "$BE" "$FE" "$NG" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    rm -f "$SCRIPT"
}
trap cleanup EXIT

# 受け取った X-Forwarded-For をそのまま返すだけのサーバー（ポートは引数）
cat > "$SCRIPT" <<'PY'
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        body = ("XFF=" + str(self.headers.get("X-Forwarded-For"))).encode()
        self.send_response(200); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
HTTPServer(("0.0.0.0", int(sys.argv[1])), H).serve_forever()
PY

docker network create "$NET" >/dev/null
docker run -d --name "$BE" --network "$NET" --network-alias backend -v "$SCRIPT:/s.py:ro" python:3.12-slim python /s.py 8000 >/dev/null
docker run -d --name "$FE" --network "$NET" --network-alias frontend -v "$SCRIPT:/s.py:ro" python:3.12-slim python /s.py 3000 >/dev/null
docker run -d --name "$NG" --network "$NET" -p 127.0.0.1::80 \
    -v "$REPO/nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine >/dev/null

echo "- nginx.conf の構文"
docker exec "$NG" nginx -t >/dev/null 2>&1; assert_eq "nginx -t" 0 "$?"

PORT="$(docker port "$NG" 80/tcp | head -1 | sed 's/.*://')"
n=0
until curl -s -o /dev/null "http://127.0.0.1:$PORT/api/x" 2>/dev/null; do
    n=$((n + 1)); [ "$n" -ge 30 ] && break; sleep 1
done

for path in /api/x /api/auth/x /x; do
    case "$path" in
        /api/auth/*|/x) upstream="frontend" ;;
        *) upstream="backend" ;;
    esac
    echo "- ${path}（${upstream} へ転送）"
    plain="$(curl -s "http://127.0.0.1:$PORT$path")"
    forged="$(curl -s -H 'X-Forwarded-For: 1.2.3.4' "http://127.0.0.1:$PORT$path")"
    forged2="$(curl -s -H 'X-Forwarded-For: 9.9.9.9, 8.8.8.8' "http://127.0.0.1:$PORT$path")"
    assert_contains "ヘッダが upstream に届く" "$plain" "XFF="
    assert_eq "偽の X-Forwarded-For（1個）は捨てられ、偽装なしと同じ値になる" "$plain" "$forged"
    assert_eq "偽の X-Forwarded-For（複数）も捨てられる" "$plain" "$forged2"
    case "$forged $forged2" in *1.2.3.4*|*9.9.9.9*|*8.8.8.8*) fail "偽のIPが upstream に届いている: $forged / $forged2";; *) ok "偽のIPは upstream に届かない";; esac
    case "$plain" in *,*) fail "複数の値が付いている: $plain";; *) ok "値は1個だけ";; esac
done

finish
