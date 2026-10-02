#!/usr/bin/env python3
"""本番用の compose（docker-compose.yml + docker-compose.prod.yml をマージした結果）に、開発用の設定が残っていないか検査する。

compose の `volumes` などはマージ（追記）されるため、prod 側に書いただけでは開発用の設定が消えないことがある
（過去に backend で、ホストのソースの bind mount・.venv の匿名ボリューム・--reload が本番に残っていた）。
そのため、ファイルではなく「マージ後の最終的な設定」を `docker compose config` で取り出して検査する。

使い方: python3 scripts/tests/check_prod_compose.py   （docker compose が使えること。daemon は不要）
終了コード: 0 = 問題なし / 1 = 問題あり
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
problems = []


def bad(msg):
    problems.append(msg)
    print(f"  NG  {msg}")


def good(msg):
    print(f"  ok  {msg}")


tmp = tempfile.mkdtemp(prefix="check-prod-compose-")
try:
    for name in ("docker-compose.yml", "docker-compose.prod.yml"):
        shutil.copy(os.path.join(ROOT, name), tmp)
    # compose は env_file の存在を確認するので、example からダミーを作る
    for d, example in (("backend", ".env.example"), ("frontend/server", ".env.example"), ("db", ".env.example"), ("tutor", ".env.example")):
        os.makedirs(os.path.join(tmp, d), exist_ok=True)
        shutil.copy(os.path.join(ROOT, d, example), os.path.join(tmp, d, ".env"))
    proc = subprocess.run(
        ["docker", "compose", "-f", "docker-compose.yml", "-f", "docker-compose.prod.yml", "config", "--format", "json"],
        cwd=tmp, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        print(proc.stderr)
        print("docker compose config が失敗しました")
        sys.exit(1)
    cfg = json.loads(proc.stdout)
finally:
    shutil.rmtree(tmp, ignore_errors=True)

services = cfg["services"]


def command_text(svc):
    cmd = svc.get("command")
    if cmd is None:
        return ""
    return " ".join(cmd) if isinstance(cmd, list) else str(cmd)


def volumes(svc):
    return svc.get("volumes") or []


def binds(svc):
    return [v for v in volumes(svc) if v.get("type") == "bind"]


print("本番用にマージした設定を検査します")

# --- 全サービス共通 ---
for name, svc in services.items():
    if "--reload" in command_text(svc):
        bad(f"{name}: command に --reload が残っている（開発用）")
    if svc.get("privileged"):
        bad(f"{name}: privileged: true が残っている")
    if svc.get("tty") or svc.get("stdin_open"):
        bad(f"{name}: tty / stdin_open が残っている（開発用）")
    if name != "nginx" and svc.get("ports"):
        bad(f"{name}: ホストにポートを公開している: {svc['ports']}（本番は nginx だけ）")
    if svc.get("restart") != "unless-stopped":
        bad(f"{name}: restart が unless-stopped ではない（{svc.get('restart')!r}）")
good("全サービス: --reload・privileged・tty なし、公開ポートは nginx のみ、restart: unless-stopped") if not problems else None

# --- backend ---
b = services["backend"]
if binds(b):
    bad(f"backend: ホストのディレクトリが bind mount されている: {[v['source'] + ' -> ' + v['target'] for v in binds(b)]}")
anon = [v for v in volumes(b) if v.get("type") == "volume" and not v.get("source")]
if anon:
    bad(f"backend: 匿名ボリュームが残っている: {[v['target'] for v in anon]}（再デプロイしても古いまま残る）")
vols = sorted((v.get("source") or "(匿名)", v["target"]) for v in volumes(b))
if vols != [("uploads-data", "/app/uploads")]:
    bad(f"backend: volumes が想定（uploads-data -> /app/uploads のみ）と違う: {vols}")
if b.get("command") not in (None, [], ""):
    bad(f"backend: command が上書きされている（Dockerfile の CMD を使うはず）: {command_text(b)}")
if not problems:
    good("backend: bind mount・匿名ボリューム・--reload なし。uploads-data のみ。Dockerfile の CMD で起動")

# --- tutor ---
t = services["tutor"]
src_binds = [v["target"] for v in binds(t) if v["target"] in ("/app/app", "/app/core", "/app/config", "/app/tests")]
if src_binds:
    bad(f"tutor: ソースの bind mount が残っている: {src_binds}")
if t.get("command") not in (None, [], ""):
    bad(f"tutor: command が上書きされている: {command_text(t)}")

# --- frontend ---
f = services["frontend"]
if volumes(f):
    bad(f"frontend: volumes が残っている: {[v['target'] for v in volumes(f)]}")
if f.get("command") not in (None, [], ""):
    bad(f"frontend: command が上書きされている: {command_text(f)}")
args = (f.get("build") or {}).get("args") or {}
if args.get("REQUIRE_PUBLIC_ENV") != "1":
    bad("frontend: build.args の REQUIRE_PUBLIC_ENV=1 が無い（NEXT_PUBLIC_* の渡し忘れを検知できない）")

# --- db / nginx ---
d = services["db"]
if not any(v.get("type") == "volume" and v.get("source") == "postgres-data" and v["target"] == "/var/lib/postgresql/data" for v in volumes(d)):
    bad("db: postgres-data が /var/lib/postgresql/data にマウントされていない")
anon_db = [v["target"] for v in volumes(d) if v.get("type") == "volume" and not v.get("source")]
if anon_db:
    bad(f"db: 匿名ボリュームがある: {anon_db}")
n = services["nginx"]
published = [(p.get("published"), p.get("target")) for p in n.get("ports", [])]
if published != [("4000", 80)]:
    bad(f"nginx: 公開ポートが想定（4000 -> 80）と違う: {published}")

# --- backup（定期バックアップ。誤ってコンテナ・ボリュームを消してもデータが残るための備え）---
if "backup" not in services:
    bad("backup サービスが無い（定期バックアップが動かない）")
else:
    bk = services["backup"]
    bk_binds = {v["target"]: v for v in binds(bk)}
    if "/backups" not in bk_binds:
        bad("backup: /backups がホストのディレクトリ（bind mount）になっていない（Docker のボリュームの中だと、ボリュームごと消える）")
    elif not bk_binds["/backups"]["source"].endswith("/db/backups"):
        bad(f"backup: 保存先が ./db/backups ではない: {bk_binds['/backups']['source']}")
    up = [v for v in volumes(bk) if v["target"] == "/data/uploads"]
    if not up or up[0].get("source") != "uploads-data" or not up[0].get("read_only"):
        bad("backup: uploads-data を読み取り専用（/data/uploads）でマウントしていない")
    if not bk.get("healthcheck"):
        bad("backup: healthcheck が無い（バックアップが取れなくなっても気付けない）")
    if bk.get("restart") != "unless-stopped":
        bad("backup: restart が unless-stopped ではない")

# --- DB・アップロードのボリュームは external（down -v でも消えない／無いときは空で作らず失敗する）---
top = cfg.get("volumes", {})
for key, expected in (("postgres-data", "fast-api-lms_react_postgres-data"), ("uploads-data", "fast-api-lms_react_uploads-data")):
    v = top.get(key) or {}
    if v.get("external") is not True:
        bad(f"ボリューム {key} が external ではない（`docker compose down -v` で消える）")
    elif v.get("name") != expected:
        bad(f"ボリューム {key} の名前が既存の本番と違う: {v.get('name')!r}（想定 {expected!r}）")
    else:
        good(f"ボリューム {key} は external（名前 {expected}）")

if "init" in services:
    bad("init サービスが残っている（本番ではデプロイのたびのシード投入を廃止した）")

print()
print(f"問題 {len(problems)} 件")
sys.exit(1 if problems else 0)
