#!/bin/sh
# LLM（学内の AI サーバー）に繋がらないときの tutor の挙動の検証（本物の tutor コンテナと、偽の LLM サーバーを使う）。
#   - 繋がらない／応答しない → 汎用の 500 ではなく、「メンテナンス中」の 503（code=llm_unavailable）を、早く返すこと
#   - 一度失敗したら、しばらくは即座に断ること（待たせない。DB のロック用接続を握らない）
#   - 復旧したら、人手なしで自動的に元に戻ること（/health の疎通確認）
#   - 手動のメンテナンス切り替え（管理用 API）ができること
# 使い捨てのコンテナ・ネットワークだけを触る（既存のものには触れない）。実データの知識ベース（tutor/data）を読み取り専用で使う。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

SUF="$$"
NET="llmdown-net-$SUF"
IMG="llmdown-img-$SUF"
TUTOR="llmdown-tutor-$SUF"
STUBS="llmdown-stub-$SUF"
SCRIPT="$(mktemp)"
cleanup() {
    docker rm -f "$TUTOR" "$STUBS" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    docker rmi -f "$IMG" >/dev/null 2>&1 || true
    rm -f "$SCRIPT"
}
trap cleanup EXIT

# 偽の LLM ゲートウェイ。MODE=hang: 接続は受けるが何も返さない / MODE=ok: GET /v1/models に 200 を返す
cat > "$SCRIPT" <<'PY'
import os, socket, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer
if os.environ.get("MODE") == "hang":
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(("0.0.0.0", 8000)); s.listen(50)
    def hold(c): time.sleep(3600)
    while True:
        c, _ = s.accept(); threading.Thread(target=hold, args=(c,), daemon=True).start()
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        body = b'{"data":[{"id":"stub"}]}'
        self.send_response(200); self.send_header("Content-Type","application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        self.send_response(500); self.end_headers()
    def log_message(self, *a): pass
HTTPServer(("0.0.0.0", 8000), H).serve_forever()
PY

docker build -q -t "$IMG" "$REPO/tutor" >/dev/null || { fail "tutor イメージをビルドできない"; finish; exit 1; }
docker network create "$NET" >/dev/null

# 待ち時間は、テストのために短くする（本番の既定: 接続 5 秒 / 読み取り 45 秒 / 遮断 30 秒 / 疎通確認 30 秒）
docker run -d --name "$TUTOR" --network "$NET" \
    -e ANTHROPIC_BASE_URL=http://llm-stub:8000 -e VLLM_MANAGER_URL=http://llm-stub:8000 \
    -e TUTOR_LLM_CONNECT_TIMEOUT_SEC=2 -e TUTOR_LLM_READ_TIMEOUT_SEC=3 -e TUTOR_EMBED_TIMEOUT_SEC=3 \
    -e TUTOR_LLM_BREAKER_SEC=5 -e TUTOR_LLM_PROBE_TTL_SEC=2 \
    -v "$REPO/tutor/data:/app/data:ro" "$IMG" >/dev/null
n=0
until docker exec "$TUTOR" curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1; do
    n=$((n + 1)); [ "$n" -ge 90 ] && break; sleep 2
done
docker exec "$TUTOR" curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1 || { fail "tutor が起動しない"; docker logs "$TUTOR" 2>&1 | tail -5; finish; exit 1; }

# tutor に HTTP リクエストを送り「ステータス|経過秒|code|本文」を返す: call METHOD PATH [JSON]
call() {
    docker exec -i -e M="$1" -e P="$2" -e B="${3:-}" "$TUTOR" python - <<'PY'
import json, os, time, urllib.request, urllib.error
t = time.time()
data = os.environ["B"].encode() if os.environ.get("B") else None
req = urllib.request.Request("http://127.0.0.1:8765" + os.environ["P"], data=data, method=os.environ["M"],
                             headers={"Content-Type": "application/json", "X-Student-Id": "5"})
try:
    r = urllib.request.urlopen(req, timeout=40); code, body = r.status, r.read().decode()
except urllib.error.HTTPError as e:
    code, body = e.code, e.read().decode()
try:
    j = json.loads(body)
except Exception:
    j = {}
print(f"{code}|{round(time.time() - t, 1)}|{j.get('code', '')}|{body[:400].replace(chr(10), ' ')}")
PY
}
field() { echo "$1" | cut -d'|' -f"$2"; }
less_than() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a<b)}'; }
ASK='{"text":"固有値とは何ですか"}'

echo "- (A) LLM サーバーに繋がらない（名前が引けない）"
h="$(call GET /health)"
assert_eq "/health は 200（LLM が落ちていても、コンテナ自体は healthy のまま）" 200 "$(field "$h" 1)"
assert_contains "/health に LLM の状態が入る" "$h" '"llm"'
r="$(call POST /session/message "$ASK")"
assert_eq "質問 → 503（汎用の 500 ではない）" 503 "$(field "$r" 1)"
assert_eq "code=llm_unavailable" llm_unavailable "$(field "$r" 3)"
assert_contains "学生向けの文面は『メンテナンス中』" "$r" "メンテナンス中"
assert_not_contains "内部の詳細（例外名・URL）を学生に見せない" "$r" "Connection"
less_than "$(field "$r" 2)" 10 && ok "早く返る（$(field "$r" 2) 秒）" || fail "返るのが遅い（$(field "$r" 2) 秒）"
r2="$(call POST /session/message "$ASK")"
assert_eq "2回目も 503" 503 "$(field "$r2" 1)"
less_than "$(field "$r2" 2)" 1 && ok "2回目は即座に断る（回路遮断: $(field "$r2" 2) 秒）" || fail "2回目が遅い（$(field "$r2" 2) 秒）"
h="$(call GET /health)"
assert_contains "/health が down を示す" "$h" '"state":"down"'
assert_contains "/health に学生向けの文面" "$h" "メンテナンス中"

echo "- (B) LLM サーバーが応答しない（接続は受けるが何も返さない）"
docker run -d --name "$STUBS" --network "$NET" --network-alias llm-stub -e MODE=hang -v "$SCRIPT:/s.py:ro" python:3.12-slim python /s.py >/dev/null
sleep 6   # 遮断時間（5 秒）が過ぎるのを待つ
r="$(call POST /session/message "$ASK")"
r_sec="$(field "$r" 2)"
assert_eq "応答しない場合も 503" 503 "$(field "$r" 1)"
assert_eq "code=llm_unavailable" llm_unavailable "$(field "$r" 3)"
less_than "$(field "$r" 2)" 12 && ok "疎通確認で見切る（${r_sec} 秒。以前は 60 秒待っても応答なし）" || fail "見切りが遅い（${r_sec} 秒）"
r2="$(call POST /session/message "$ASK")"
less_than "$(field "$r2" 2)" 1 && ok "直後の質問は即座に断る（$(field "$r2" 2) 秒）" || fail "直後の質問が遅い"

echo "- (C) 復旧: LLM サーバーが戻ると、人手なしで元に戻る"
docker rm -f "$STUBS" >/dev/null 2>&1
docker run -d --name "$STUBS" --network "$NET" --network-alias llm-stub -e MODE=ok -v "$SCRIPT:/s.py:ro" python:3.12-slim python /s.py >/dev/null
sleep 3
n=0; state=""
while [ "$n" -lt 30 ]; do
    h="$(call GET /health)"
    case "$h" in *'"state":"ok"'*) state=ok; break;; esac
    n=$((n + 1)); sleep 2
done
assert_eq "/health が自動で ok に戻る（質問が1件も無くても復旧を検知）" ok "$state"

echo "- (D) 手動のメンテナンス（学内の AI サーバーの計画停止など）"
r="$(call PUT /admin/settings '{"maintenance": true, "maintenance_message": "AIサーバーの点検のため 15:00〜16:00 は使えません。"}')"
assert_eq "設定できる" 200 "$(field "$r" 1)"
r="$(call POST /session/message "$ASK")"
assert_eq "質問 → 503" 503 "$(field "$r" 1)"
assert_contains "管理者が書いた文面が学生に出る" "$r" "15:00〜16:00"
h="$(call GET /health)"
assert_contains "/health が maintenance を示す" "$h" '"state":"maintenance"'
call PUT /admin/settings '{"maintenance": false}' >/dev/null
h="$(call GET /health)"
case "$h" in *'"state":"maintenance"'*) fail "解除しても maintenance のまま";; *) ok "解除すると maintenance が外れる";; esac

finish
