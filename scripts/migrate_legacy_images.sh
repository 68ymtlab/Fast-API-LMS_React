#!/bin/sh
# 旧形式の画像（DB に ./static/images/... として登録されたもの）を、ホストから uploads ボリュームへコピーする。
#
# なぜ必要か:
#   以前の本番は、ホストの backend/ を bind mount していたため、旧形式の画像（ホストの backend/static/images/ に
#   保存されていたもの）が見えていた。本番用の構成（bind mount なし）ではホストの backend/ が見えなくなるため、
#   uploads ボリュームの static/images/ に置く。backend は画像を ① backend/static/... ② UPLOAD_ROOT/static/... の
#   順に探すので、コードの変更は要らない（lessons_router.py の get_image_file）。
#
# 安全性: 既にあるファイルは上書きしない（無いものだけコピー）。元のファイルは消さない。何度実行しても安全。
#
# 使い方:
#   ./scripts/migrate_legacy_images.sh [uploads ボリューム名]
#   （省略時は compose のプロジェクト名から <project>_uploads-data を使う）
set -eu

cd "$(dirname "$0")/.."

SRC="backend/static/images"
VOLUME="${1:-}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

COUNT="$(find "$SRC" -type f ! -name '.gitkeep' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${COUNT:-0}" = "0" ]; then
    log "[OK] ホストの $SRC に旧形式の画像はありません。移行は不要です。"
    exit 0
fi

if [ -z "$VOLUME" ]; then
    PROJECT="$(docker compose -f docker-compose.yml -f docker-compose.prod.yml config 2>/dev/null | sed -n 's/^name: //p' | head -1)"
    if [ -z "$PROJECT" ]; then
        log "[ERROR] compose のプロジェクト名を取得できません。ボリューム名を引数で指定してください。"
        exit 1
    fi
    VOLUME="${PROJECT}_uploads-data"
fi

log "旧形式の画像 ${COUNT} 個を、ボリューム ${VOLUME} の static/images/ へコピーします（上書きしない・元は消さない）..."
# 注: alpine（busybox）の `cp -n` はサブディレクトリの中身をコピーしないことがあるため、ファイルごとに「無ければコピー」する
docker run --rm -v "$VOLUME":/up -v "$(pwd)/$SRC":/src:ro alpine sh -c '
    set -e
    mkdir -p /up/static/images
    cd /src
    find . -type d | while IFS= read -r d; do mkdir -p "/up/static/images/$d"; done
    find . -type f ! -name .gitkeep | while IFS= read -r f; do
        [ -e "/up/static/images/$f" ] || cp -a "$f" "/up/static/images/$f"
    done
'

# コピーできたか確認（ホストの各ファイルが、ボリュームに存在すること）
MISSING="$(docker run --rm -v "$VOLUME":/up -v "$(pwd)/$SRC":/src:ro alpine \
    sh -c 'cd /src && find . -type f ! -name .gitkeep | while IFS= read -r f; do [ -f "/up/static/images/$f" ] || echo "$f"; done' | wc -l | tr -d ' ')"
if [ "$MISSING" != "0" ]; then
    log "[ERROR] ${MISSING} 個のファイルがボリュームにありません。移行に失敗しました。"
    exit 1
fi
log "[OK] 旧形式の画像 ${COUNT} 個がボリューム内にあります。"
