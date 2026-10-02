#!/usr/bin/env python3
"""シェルスクリプトで「変数名の直後に全角文字が続く裸の変数」（例: "$name）"）を検出する。

sh / bash は、全角文字（マルチバイト）を変数名の一部として読むことがあり、`$name（...` が
「name＋全角文字」という未定義の変数になる。`set -u` 付きのスクリプトでは unbound variable で落ちる。
日本語のメッセージに変数を埋め込むときは、必ず ${name} と波括弧で囲むこと。

使い方: python3 scripts/tests/check_shell_vars.py
終了コード: 0 = 問題なし / 1 = 該当あり
"""
import glob
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
PATTERN = re.compile(r"\$(?!\{)([A-Za-z_][A-Za-z0-9_]*)([^\x00-\x7f])")

bad = 0
files = sorted(glob.glob(os.path.join(ROOT, "scripts", "*.sh")) + glob.glob(os.path.join(ROOT, "scripts", "tests", "*.sh")))
for path in files:
    with open(path, encoding="utf-8") as f:
        for n, line in enumerate(f, 1):
            if line.lstrip().startswith("#"):
                continue
            for m in PATTERN.finditer(line):
                print(f"NG {os.path.relpath(path, ROOT)}:{n}: {m.group(0)}   → ${{{m.group(1)}}} にする")
                bad += 1

print(f"{len(files)} 個のシェルスクリプトを検査 / 該当 {bad} 件")
sys.exit(1 if bad else 0)
