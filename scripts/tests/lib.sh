#!/bin/sh
# テスト共通の小さなヘルパ（source して使う）
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); echo "  ok   - $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL - $1"; }

# assert_eq <説明> <期待値> <実際の値>
assert_eq() {
    if [ "$2" = "$3" ]; then ok "$1"; else fail "$1（期待: '$2' / 実際: '$3'）"; fi
}

# assert_contains <説明> <出力> <含まれるべき文字列>
assert_contains() {
    if printf '%s' "$2" | grep -qF -- "$3"; then ok "$1"; else fail "$1（'$3' が出力に無い）"; fi
}

# assert_not_contains <説明> <出力> <含まれてはいけない文字列>
assert_not_contains() {
    if printf '%s' "$2" | grep -qF -- "$3"; then fail "$1（'$3' が出力に含まれている）"; else ok "$1"; fi
}

finish() {
    echo ""
    echo "結果: ${PASS} 件成功 / ${FAIL} 件失敗"
    [ "$FAIL" -eq 0 ]
}

# Postgres コンテナが本起動するまで待つ（初期化中の一時サーバと本起動で 'ready' が2回出る）
wait_pg_ready() {
    _n=0
    _ready=0
    while [ "$_n" -lt 90 ]; do
        _ready="$(docker logs "$1" 2>&1 | grep -c 'ready to accept connections' || true)"
        [ "$_ready" -ge 2 ] && return 0
        _n=$((_n + 1))
        sleep 1
    done
    return 1
}
