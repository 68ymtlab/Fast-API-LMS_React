#!/usr/bin/env python3
"""frontend のコードで使っている NEXT_PUBLIC_* が、ビルドに渡る設定に全て入っているか検査する。

NEXT_PUBLIC_* はビルド時にバンドルへ焼き込まれる。.env をイメージに入れない構成では、
Dockerfile の ARG と docker-compose.prod.yml の build.args に書いていない変数は、本番で未設定（undefined）になる。
コードで新しい NEXT_PUBLIC_* を使ったのに、ここへの追加を忘れる事故を防ぐ。

使い方: python3 scripts/tests/check_public_env.py
終了コード: 0 = 問題なし / 1 = 漏れあり
"""
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "frontend", "server", "src")
NAME = re.compile(r"NEXT_PUBLIC_[A-Z0-9_]+")

used = {}
for dirpath, dirnames, filenames in os.walk(SRC):
    for fn in filenames:
        if not fn.endswith((".ts", ".tsx", ".js", ".jsx")) or ".stories." in fn:
            continue
        path = os.path.join(dirpath, fn)
        with open(path, encoding="utf-8") as f:
            for name in NAME.findall(f.read()):
                used.setdefault(name, os.path.relpath(path, ROOT))

with open(os.path.join(ROOT, "frontend", "docker", "Dockerfile"), encoding="utf-8") as f:
    dockerfile_args = set(re.findall(r"^ARG\s+([A-Z0-9_]+)", f.read(), re.M))
with open(os.path.join(ROOT, "docker-compose.prod.yml"), encoding="utf-8") as f:
    compose_args = set(re.findall(r"^\s*-\s+([A-Z0-9_]+)(?:=.*)?\s*$", f.read(), re.M))

problems = 0
for name, where in sorted(used.items()):
    if name not in dockerfile_args:
        print(f"MISSING in frontend/docker/Dockerfile (ARG): {name}  (使用箇所: {where})")
        problems += 1
    if name not in compose_args:
        print(f"MISSING in docker-compose.prod.yml (build.args): {name}  (使用箇所: {where})")
        problems += 1

print(f"コードで使っている NEXT_PUBLIC_*: {', '.join(sorted(used)) or '(なし)'}")
print(f"問題 {problems} 件")
sys.exit(1 if problems else 0)
