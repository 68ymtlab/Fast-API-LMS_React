#!/usr/bin/env python3
"""Markdown の相対リンクが実在するファイルを指しているか検査する（docs の整理後にリンク切れを出さないため）。

使い方: python3 scripts/tests/check_md_links.py   （リポジトリのどこから実行してもよい）
終了コード: 0 = 問題なし / 1 = リンク切れあり
"""
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
SKIP_DIRS = {".git", "node_modules", ".next", ".venv", "data"}
LINK = re.compile(r"\]\(([^)#\s]+)(#[^)]*)?\)")

broken = 0
checked = 0
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
    for name in filenames:
        if not name.endswith(".md"):
            continue
        path = os.path.join(dirpath, name)
        checked += 1
        with open(path, encoding="utf-8") as f:
            text = f.read()
        for m in LINK.finditer(text):
            target = m.group(1)
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved = os.path.normpath(os.path.join(dirpath, target))
            if not os.path.exists(resolved):
                print(f"BROKEN {os.path.relpath(path, ROOT)}: {target}")
                broken += 1

print(f"{checked} 個の .md を検査 / リンク切れ {broken} 件")
sys.exit(1 if broken else 0)
