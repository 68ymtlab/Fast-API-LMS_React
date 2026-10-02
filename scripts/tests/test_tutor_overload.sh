#!/bin/sh
# LLM サーバーが「混み合っている」ときの tutor の挙動と、管理画面のモデル一覧・接続テストの検証
# （本物の tutor コンテナと、偽の LLM サーバー（vllm-manager 相当）を使う）。
#   - 応答が遅いだけ（サーバーは生きている）→ 「メンテナンス中」ではなく「混み合っています」（503・code=overloaded）。回路遮断しない
#   - 同時数の上限を超える質問は、長く待たせずに「混み合っています」と返す
#   - 管理画面: vllm-manager で起動中のチャットモデルが自動で出る（埋め込み・リランカーは除く／停止中は区別／別名 vllm-local）
#   - 接続テスト: 使える・モデルが無い・応答が遅い、を見分けて返す
# 使い捨てのコンテナ・ネットワークだけを触る（既存のものには触れない）。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

SUF="$$"
NET="overload-net-$SUF"
IMG="overload-img-$SUF"
TUTOR="overload-tutor-$SUF"
STUBS="overload-stub-$SUF"
SCRIPT="$(mktemp)"
TMPD="$(mktemp -d)"
cleanup() {
    [ -n "${OVERLOAD_DEBUG:-}" ] && docker logs "$TUTOR" 2>&1 | tail -60
    docker rm -f "$TUTOR" "$STUBS" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
    docker rmi -f "$IMG" >/dev/null 2>&1 || true
    rm -rf "$SCRIPT" "$TMPD"
}
trap cleanup EXIT

# 偽の vllm-manager / LiteLLM。モデル名で挙動が変わる: ok=すぐ返す / slow=30 秒返さない / missing=404
cat > "$SCRIPT" <<'PY'
import json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

class H(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/instances":
            if self.headers.get("Authorization") != "Bearer vlmk_test":
                return self._json(401, {"detail": "no"})
            return self._json(200, [
                {"task_type": "chat", "model_id": "ok-model", "running": True, "healthy": True},
                {"task_type": "chat", "model_id": "slow", "running": True, "healthy": True},
                {"task_type": "chat", "model_id": "stopped-model", "running": False, "healthy": False},
                {"task_type": "embedding", "model_id": "embed-model", "running": True, "healthy": True},
                {"task_type": "rerank", "model_id": "rerank-model", "running": True, "healthy": True},
            ])
        return self._json(200, {"data": [{"id": "ok-model"}]})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        req = json.loads(self.rfile.read(n) or b"{}")
        model = req.get("model")
        if not self.path.endswith("/chat/completions"):
            time.sleep(30)   # 埋め込み・リランカーも応答しない（混み合っている状態）
            return self._json(200, {})
        if model == "missing":
            return self._json(404, {"error": {"message": "model not found"}})
        if model == "slow":
            time.sleep(30)
        self.send_response(200); self.send_header("Content-Type", "text/event-stream"); self.end_headers()
        for t in ("こん", "にちは"):
            chunk = {"id": "x", "object": "chat.completion.chunk", "created": 0, "model": model,
                     "choices": [{"index": 0, "delta": {"content": t}, "finish_reason": None}]}
            self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
        self.wfile.write(b"data: [DONE]\n\n")

    def log_message(self, *a): pass

ThreadingHTTPServer(("0.0.0.0", 8000), H).serve_forever()
PY

docker build -q -t "$IMG" "$REPO/tutor" >/dev/null || { fail "tutor イメージをビルドできない"; finish; exit 1; }
docker network create "$NET" >/dev/null
docker run -d --name "$STUBS" --network "$NET" --network-alias llm-stub -v "$SCRIPT:/s.py:ro" python:3.12-slim python /s.py >/dev/null

# 同時 1 件・待ちは 1 秒まで・LLM の読み取りは 3 秒で見切る（本番の既定: 4 件 / 45 秒 / 45 秒）
docker run -d --name "$TUTOR" --network "$NET" \
    -e ANTHROPIC_BASE_URL=http://llm-stub:8000 -e VLLM_MANAGER_URL=http://llm-stub:8000 -e VLLM_MANAGER_TOKEN=vlmk_test \
    -e ANTHROPIC_DEFAULT_SONNET_MODEL=ok-model \
    -e TUTOR_LLM_CONNECT_TIMEOUT_SEC=2 -e TUTOR_LLM_READ_TIMEOUT_SEC=3 -e TUTOR_EMBED_TIMEOUT_SEC=3 \
    -e TUTOR_LLM_BREAKER_SEC=5 -e TUTOR_LLM_PROBE_TTL_SEC=2 \
    -e TUTOR_LLM_MAX_CONCURRENT=1 -e TUTOR_LLM_MAX_WAIT_SEC=1 -e TUTOR_LLM_MAX_QUEUE=5 \
    -v "$REPO/tutor/data:/app/data:ro" "$IMG" >/dev/null
n=0
until docker exec "$TUTOR" curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1; do
    n=$((n + 1)); [ "$n" -ge 90 ] && break; sleep 2
done
docker exec "$TUTOR" curl -fsS http://127.0.0.1:8765/health >/dev/null 2>&1 || { fail "tutor が起動しない"; docker logs "$TUTOR" 2>&1 | tail -5; finish; exit 1; }

# call METHOD PATH [JSON] [学生ID] → 「ステータス|経過秒|code|本文」
call() {
    docker exec -i -e M="$1" -e P="$2" -e B="${3:-}" -e S="${4:-5}" "$TUTOR" python - <<'PY'
import json, os, time, urllib.request, urllib.error
t = time.time()
data = os.environ["B"].encode() if os.environ.get("B") else None
req = urllib.request.Request("http://127.0.0.1:8765" + os.environ["P"], data=data, method=os.environ["M"],
                             headers={"Content-Type": "application/json", "X-Student-Id": os.environ["S"]})
try:
    r = urllib.request.urlopen(req, timeout=60); code, body = r.status, r.read().decode()
except urllib.error.HTTPError as e:
    code, body = e.code, e.read().decode()
try:
    j = json.loads(body)
except Exception:
    j = {}
print(f"{code}|{round(time.time() - t, 1)}|{j.get('code', '')}|{body[:600].replace(chr(10), ' ')}")
PY
}
field() { echo "$1" | cut -d'|' -f"$2"; }
less_than() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a<b)}'; }
ASK='{"text":"固有値とは何ですか"}'

echo "- (A) 管理画面のモデル一覧（vllm-manager で起動中のモデルを自動で取る）"
m="$(call GET /admin/models)"
assert_eq "取得できる" 200 "$(field "$m" 1)"
assert_contains "取得元は vllm-manager" "$m" '"source":"manager"'
assert_contains "起動中のチャットモデルが出る" "$m" '"id":"ok-model","state":"running"'
assert_contains "停止中のモデルは区別される" "$m" '"id":"stopped-model","state":"stopped"'
assert_not_contains "埋め込みモデルは出ない" "$m" "embed-model"
assert_not_contains "リランカーは出ない" "$m" "rerank-model"
assert_contains "別名 vllm-local が選べる" "$m" '"id":"vllm-local","state":"alias"'

echo "- (B) 接続テスト（保存せずに、選んだモデルで1回だけ試す）"
t="$(call POST /admin/models/test '{"model":"ok-model"}')"
assert_contains "使えるモデル → ok" "$t" '"ok":true'
assert_contains "返答が返る" "$t" "こんにちは"
t="$(call POST /admin/models/test '{"model":"missing"}')"
assert_contains "無いモデル → not_found と分かる" "$t" '"kind":"not_found"'
t="$(call POST /admin/models/test '{"model":"slow"}')"
assert_contains "応答が遅いモデル → timeout と分かる" "$t" '"kind":"timeout"'
less_than "$(field "$t" 2)" 15 && ok "テストは長く待たない（$(field "$t" 2) 秒）" || fail "テストが長い（$(field "$t" 2) 秒）"
s="$(call GET /admin/settings)"
assert_contains "テストでは設定が変わらない" "$s" '"llm_model":"ok-model"'

echo "- (C) サーバーは生きているが、応答が遅い → 「混み合っています」（メンテナンス中ではない）"
call PUT /admin/settings '{"llm_model":"slow"}' >/dev/null
r="$(call POST /session/message "$ASK")"
assert_eq "質問 → 503" 503 "$(field "$r" 1)"
assert_eq "code=overloaded（llm_unavailable ではない）" overloaded "$(field "$r" 3)"
assert_contains "文面は『混み合っています』" "$r" "混み合っています"
assert_not_contains "『メンテナンス中』と出さない" "$r" "メンテナンス中"
assert_contains "待ち時間の目安が付く" "$r" "retry_after_sec"
h="$(call GET /health)"
case "$h" in *'"state":"down"'*) fail "混雑なのに /health が down（回路遮断してしまっている）";; *) ok "/health は down にならない";; esac
r2="$(call POST /session/message "$ASK")"
assert_eq "直後の質問も遮断されずに処理される（overloaded）" overloaded "$(field "$r2" 3)"

echo "- (D) 同時数の上限: 順番を待てない質問は、長く待たせずに断る"
docker exec "$TUTOR" true
( call POST /session/message "$ASK" 11 > "$TMPD/a" ) &
sleep 0.5
( call POST /session/message "$ASK" 12 > "$TMPD/b" ) &
wait
a="$(cat "$TMPD/a")"; b="$(cat "$TMPD/b")"
assert_eq "先に入った質問は処理される（LLM が遅いので overloaded）" overloaded "$(field "$a" 3)"
assert_eq "後の質問も overloaded" overloaded "$(field "$b" 3)"
# 待ちを諦めた側は 1 秒＋α で返る。処理された側は LLM の読み取りタイムアウト（3 秒）まで。
fast="$(awk -F'|' -v x="$(field "$a" 2)" -v y="$(field "$b" 2)" 'BEGIN{print (x<y)?x:y}')"
less_than "$fast" 2.5 && ok "順番を待てなかった側は早く返る（${fast} 秒）" || fail "待たされた（${fast} 秒）"

echo "- (E) 同じ学生の連打は 429（busy）"
( call POST /session/message "$ASK" 21 > "$TMPD/c" ) &
sleep 0.5
d="$(call POST /session/message "$ASK" 21)"
wait
assert_eq "同じ学生の2件目は 429" 429 "$(field "$d" 1)"
assert_eq "code=busy" busy "$(field "$d" 3)"

echo "- (F) モデルを戻すと、普通に使える"
call PUT /admin/settings '{"llm_model":"ok-model"}' >/dev/null
s="$(call GET /admin/settings)"
assert_contains "モデルが切り替わる" "$s" '"llm_model":"ok-model"'

finish
