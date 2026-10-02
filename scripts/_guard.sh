#!/bin/sh
# 破壊的な操作の前に確認を取る共有ヘルパ（直接実行せず、各スクリプトから `.` で読み込む）
#
#   . "$(dirname "$0")/_guard.sh"
#   confirm_destructive "操作の説明"
#
# - 稼働中の lms-db があれば、その中のデータ量と削除対象ボリュームを表示する
# - 対話端末では DELETE と入力しない限り中止する
# - 非対話（cron / CI など）では CONFIRM_DESTROY=yes が無い限り中止する
# - 確認が取れたら、消す直前に自動でバックアップを取る（取れなければ消さない。SKIP_PRE_DESTROY_BACKUP=1 で省略）

confirm_destructive() {
    _what="$1"
    echo ""
    echo "!!! 警告: $_what"
    if docker inspect lms-db >/dev/null 2>&1; then
        _state="$(docker inspect --format '{{.State.Status}}' lms-db 2>/dev/null || echo unknown)"
        echo "    lms-db コンテナ: $_state"
        if [ "$_state" = "running" ]; then
            _n="$(docker exec lms-db sh -c 'psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" -tAc "SELECT count(*) FROM users"' 2>/dev/null | tr -d '[:space:]' || true)"
            if [ -n "$_n" ]; then
                echo "    users テーブル: ${_n} 件（データが入っています）"
            fi
        fi
    fi
    echo "    現在あるDB / アップロードのボリューム:"
    docker volume ls --format '{{.Name}}' 2>/dev/null | grep -E '_(postgres|uploads)-data' | sed 's/^/      - /' || true

    if [ "$CONFIRM_DESTROY" = "yes" ]; then
        echo "    (CONFIRM_DESTROY=yes のため確認を省略)"
    elif [ ! -t 0 ]; then
        echo "[ERROR] 非対話環境です。実行するなら CONFIRM_DESTROY=yes を付けてください。中止します。"
        exit 1
    else
        printf "    本当に実行するなら DELETE と入力してください: "
        read -r _ans
        if [ "$_ans" != "DELETE" ]; then
            echo "中止しました。"
            exit 1
        fi
    fi

    _pre_destroy_backup
}

# 確認が取れたら、消す直前に自動でバックアップを取る（取れなければ消さない）。
# 「誤って消してしまう」ことへの最後の備え。バックアップはホストの db/backups/ に pre-destroy-* として残る
# （Docker のボリュームの外なので、この後ボリュームが消えても残る）。
_pre_destroy_backup() {
    if [ "${SKIP_PRE_DESTROY_BACKUP:-}" = "1" ]; then
        echo "    (SKIP_PRE_DESTROY_BACKUP=1 のため、事前バックアップを省略)"
        return 0
    fi
    _bstate="$(docker inspect --format '{{.State.Status}}' lms-db 2>/dev/null || true)"
    if [ -z "$_bstate" ]; then
        echo "    [WARN] lms-db コンテナが無いので、事前バックアップは取れません（既にある db/backups/ のバックアップを確認してください）"
        return 0
    fi
    if [ "$_bstate" != "running" ]; then
        echo "    lms-db が止まっているので起動して、事前バックアップを取ります..."
        docker start lms-db >/dev/null 2>&1 || true
        _n=0
        while [ "$_n" -lt 20 ]; do
            [ "$(docker inspect --format '{{.State.Health.Status}}' lms-db 2>/dev/null)" = "healthy" ] && break
            _n=$((_n + 1)); sleep 3
        done
    fi
    echo "    消す前に、自動でバックアップを取ります（db/backups/pre-destroy-*）..."
    if ! BACKUP_PREFIX=pre-destroy ./scripts/backup.sh >/dev/null 2>&1; then
        echo "[ERROR] 事前バックアップに失敗しました。データが消えるのを避けるため、中止します。"
        echo "        原因は ./scripts/backup.sh を手で実行すると分かります。"
        echo "        DB が空・壊れているなどで、バックアップなしで本当に消してよいときだけ SKIP_PRE_DESTROY_BACKUP=1 を付けてください。"
        exit 1
    fi
    echo "    [OK] 事前バックアップ: $(ls -1t "${BACKUP_DIR:-db/backups}"/pre-destroy-db-*.sql.gz 2>/dev/null | head -1)"
}
