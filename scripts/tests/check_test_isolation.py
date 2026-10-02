#!/usr/bin/env python3
"""scripts/tests/*.sh の docker compose が、一時のプロジェクト名（-p または COMPOSE_PROJECT_NAME）で動くか検査する。

docker-compose.yml には `name:` があり、プロジェクト名を指定しない docker compose は「実際の開発・本番のスタック」と
同じプロジェクトになる。そこで `down -v --remove-orphans` を実行すると、実際のコンテナが消える
（過去に、通しのテストの片付けで開発環境のコンテナを消してしまった）。

規則: docker compose を実行するテストは、(a) COMPOSE_PROJECT_NAME を設定する、または
      (b) その行に -p <名前> を付ける、のどちらかを満たすこと。

使い方: python3 scripts/tests/check_test_isolation.py
終了コード: 0 = 問題なし / 1 = 該当あり
"""
import glob
import os
import re
import sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
# docker compose をコマンドとして実行している行（メッセージ文字列や assert の中は除く）
CMD = re.compile(r'(^|[\s(`"$])docker compose\s+(-[^\s]+\s+[^\s]+\s+)*(up|down|ps|logs|exec|build|config|stop|start|rm|run|port|restart|kill)\b')
bad = 0
files = sorted(glob.glob(os.path.join(ROOT, "scripts", "tests", "*.sh")))
for path in files:
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    text = "\n".join(lines)
    file_level = re.search(r'^\s*export\s+COMPOSE_PROJECT_NAME=', text, re.M) is not None
    for n, line in enumerate(lines, 1):
        if line.lstrip().startswith("#"):
            continue
        if re.match(r'\s*(echo|assert_\w+|run_case|ok|fail)\b', line):
            continue
        if not CMD.search(line):
            continue
        if file_level or re.search(r'\s-p\s', line) or "$COMPOSE" in line:
            # $COMPOSE は "docker compose -p <名前> ..." で定義されている前提（下で確認）
            continue
        print(f"NG {os.path.relpath(path, ROOT)}:{n}: プロジェクト名が無い docker compose: {line.strip()[:100]}")
        bad += 1
    # $COMPOSE を使うファイルは、その定義に -p が含まれること
    for m in re.finditer(r'^\s*COMPOSE="(docker compose[^"]*)"', text, re.M):
        if not file_level and " -p " not in m.group(1):
            print(f"NG {os.path.relpath(path, ROOT)}: COMPOSE の定義に -p が無い: {m.group(1)[:100]}")
            bad += 1

print(f"{len(files)} 個のテストスクリプトを検査 / 該当 {bad} 件")
sys.exit(1 if bad else 0)
