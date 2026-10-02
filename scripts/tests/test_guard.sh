#!/bin/sh
# 破壊的スクリプト（reset.sh / deploy_new_db_volume.sh）が確認なしに実行されないことのテスト。
# 偽の docker を使う。対話（tty）での入力確認は環境差があるため、非対話の経路だけを検証する。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
. "$HERE/lib.sh"

# 事前バックアップの保存先は一時ディレクトリにする（実際の db/backups を汚さない）
export BACKUP_DIR="$(mktemp -d)"
export FAKE_LOG="$(mktemp)"
export FAKE_CONTAINER=1 FAKE_VOLUMES="x_postgres-data"
export PATH="$HERE/fakebin:$PATH"
cd "$REPO"

# 非対話（stdin が tty でない）で、確認なし → 中止し、down -v を呼ばない
: > "$FAKE_LOG"
out="$(bash scripts/reset.sh < /dev/null 2>&1)"; rc=$?
echo "- reset.sh: 確認なしの非対話実行"
assert_eq "終了コード" 1 "$rc"
assert_contains "警告を表示" "$out" "警告"
assert_eq "down -v を呼んでいない" 0 "$(grep -c 'down -v' "$FAKE_LOG" || true)"

# CONFIRM_DESTROY=yes なら実行される
: > "$FAKE_LOG"
out="$(CONFIRM_DESTROY=yes bash scripts/reset.sh < /dev/null 2>&1)"; rc=$?
echo "- reset.sh: CONFIRM_DESTROY=yes"
assert_eq "終了コード" 0 "$rc"
assert_eq "down -v を呼んだ" 1 "$(grep -c 'down -v' "$FAKE_LOG" || true)"

# deploy_new_db_volume.sh も同様
for f in deploy_new_db_volume.sh; do
    : > "$FAKE_LOG"
    out="$(sh scripts/$f < /dev/null 2>&1)"; rc=$?
    echo "- $f: 確認なしの非対話実行"
    assert_eq "終了コード" 1 "$rc"
    assert_eq "compose down を呼んでいない" 0 "$(grep -c ' down' "$FAKE_LOG" || true)"
done

# ---- 消す直前の自動バックアップ ----
echo "- reset.sh: 確認が取れたら、消す前に自動でバックアップを取る"
rm -f "$BACKUP_DIR"/*
: > "$FAKE_LOG"
out="$(CONFIRM_DESTROY=yes bash scripts/reset.sh < /dev/null 2>&1)"; rc=$?
assert_eq "終了コード" 0 "$rc"
assert_contains "事前バックアップを取ったと表示" "$out" "事前バックアップ"
[ -n "$(ls "$BACKUP_DIR"/pre-destroy-db-*.sql.gz 2>/dev/null)" ] && ok "pre-destroy-db-*.sql.gz ができた" || fail "事前バックアップのファイルが無い"
# バックアップ(pg_dump)が、ボリュームを消す down -v より前に行われている
dump_line="$(grep -n 'pg_dump' "$FAKE_LOG" | head -1 | cut -d: -f1)"
down_line="$(grep -n 'down -v' "$FAKE_LOG" | head -1 | cut -d: -f1)"
[ -n "$dump_line" ] && [ -n "$down_line" ] && [ "$dump_line" -lt "$down_line" ] && ok "pg_dump が down -v より前に実行された" || fail "順序が不正（dump=$dump_line / down=${down_line}）"

echo "- 事前バックアップに失敗したら、消さずに中止する"
rm -f "$BACKUP_DIR"/*
: > "$FAKE_LOG"
out="$(FAKE_DUMP=fail CONFIRM_DESTROY=yes bash scripts/reset.sh < /dev/null 2>&1)"; rc=$?
assert_eq "終了コード 1" 1 "$rc"
assert_contains "事前バックアップの失敗を表示" "$out" "事前バックアップに失敗しました"
assert_contains "回避方法を案内" "$out" "SKIP_PRE_DESTROY_BACKUP=1"
assert_eq "down -v を呼んでいない（消していない）" 0 "$(grep -c 'down -v' "$FAKE_LOG" || true)"

echo "- SKIP_PRE_DESTROY_BACKUP=1 なら、バックアップを省略して続行できる"
: > "$FAKE_LOG"
out="$(FAKE_DUMP=fail SKIP_PRE_DESTROY_BACKUP=1 CONFIRM_DESTROY=yes bash scripts/reset.sh < /dev/null 2>&1)"; rc=$?
assert_eq "終了コード 0" 0 "$rc"
assert_eq "down -v を呼んだ" 1 "$(grep -c 'down -v' "$FAKE_LOG" || true)"

echo "- lms-db が無い場合は、警告して続行する（取れるものが無い）"
: > "$FAKE_LOG"
out="$(FAKE_CONTAINER=0 CONFIRM_DESTROY=yes bash scripts/reset.sh < /dev/null 2>&1)"; rc=$?
assert_eq "終了コード 0" 0 "$rc"
assert_contains "取れないと警告" "$out" "事前バックアップは取れません"

rm -f "$FAKE_LOG"
rm -rf "$BACKUP_DIR"
finish
