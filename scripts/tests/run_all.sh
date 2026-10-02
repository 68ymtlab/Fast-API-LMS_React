#!/bin/sh
# スクリプトの安全装置のテストを全部実行する（CI でも同じものを使う）。
#   ./scripts/tests/run_all.sh              # 全部（docker が必要。数分かかる）
#   ./scripts/tests/run_all.sh --no-heavy   # イメージのビルドを伴う重いもの（frontend イメージ・通しの検証）を除く
#   ./scripts/tests/run_all.sh --fast       # docker 不要のものだけ
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:-all}"
FAILED=0

run() {
    echo ""
    echo "===== $1 ====="
    shift
    "$@" || FAILED=1
}

run "構文チェック (bash -n)" sh -c 'for f in "$0"/../*.sh "$0"/*.sh; do bash -n "$f" || exit 1; done; echo ok' "$HERE"
run "シェルの全角文字直前の裸の変数（set -u で落ちる）" python3 "$HERE/check_shell_vars.py"
run "テストの docker compose が一時のプロジェクト名で動くか（実際のスタックを消さない）" python3 "$HERE/check_test_isolation.py"
run "Markdown のリンク切れ" python3 "$HERE/check_md_links.py"
run "frontend の NEXT_PUBLIC_* がビルド設定に揃っているか" python3 "$HERE/check_public_env.py"
run "deploy.sh（偽の docker）" sh "$HERE/test_deploy.sh"
run "破壊的スクリプトの確認（偽の docker）" sh "$HERE/test_guard.sh"
if [ "$MODE" != "--fast" ]; then
    run "本番用 compose の最終設定に開発用の設定が残っていないか" python3 "$HERE/check_prod_compose.py"
    run "backup / restore_test / schema_diff（本物の docker）" sh "$HERE/test_backup_restore.sh"
    run "定期バックアップ（backup コンテナ。本物の docker / PostgreSQL）" sh "$HERE/test_periodic_backup.sh"
    run "誤ってコンテナ・ボリュームを消した事故からの復旧（本物の docker compose）" sh "$HERE/test_disaster_recovery.sh"
    run "nginx（X-Forwarded-For の上書き・本物の nginx）" sh "$HERE/test_nginx.sh"
fi
if [ "$MODE" != "--fast" ] && [ "$MODE" != "--no-heavy" ]; then
    run "frontend イメージ（.env を含めない・NEXT_PUBLIC_* の焼き込み。数分）" sh "$HERE/test_frontend_image.sh"
    run "通しの検証（db/backend/frontend/nginx を実際に起動してログイン制限を確認。数分）" sh "$HERE/e2e_stack.sh"
fi

echo ""
if [ "$FAILED" -eq 0 ]; then echo "ALL PASSED"; else echo "FAILED"; fi
exit "$FAILED"
