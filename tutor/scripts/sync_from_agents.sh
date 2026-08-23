#!/usr/bin/env bash
# agents/workspace（研究側）から、チューターのコアコードとデータを LMS 側へ同期する。
#
#   ./tutor/scripts/sync_from_agents.sh            # データのみ（既定）
#   ./tutor/scripts/sync_from_agents.sh --code     # コアコードも上書き（その後 tutor/core の [LMS port] パッチを再適用すること）
#
# 研究側の正: $AGENTS_WORKSPACE（既定 /Users/kaihara/workspace/project/agents/workspace）
set -euo pipefail

AGENTS_WORKSPACE="${AGENTS_WORKSPACE:-/Users/kaihara/workspace/project/agents/workspace}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TUTOR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE4_SRC="$AGENTS_WORKSPACE/rag/textbooks/linear-algebra/stage4_qdrant"
STAGE4_DST="$TUTOR_DIR/data/stage4"
SYNC_CODE=0
for a in "$@"; do case "$a" in --code) SYNC_CODE=1 ;; esac; done

[[ -d "$STAGE4_SRC" ]] || { echo "not found: $STAGE4_SRC" >&2; exit 1; }

echo "==> data: $STAGE4_SRC -> $STAGE4_DST"
mkdir -p "$STAGE4_DST"
# 実行時に読むのはこの3つだけ（deeprag_search.py: EMBEDDINGS_FILE / GRAPH_FILE / QDRANT_PATH）
cp "$STAGE4_SRC/embeddings.json"      "$STAGE4_DST/embeddings.json"
cp "$STAGE4_SRC/knowledge_graph.json" "$STAGE4_DST/knowledge_graph.json"
rm -rf "$STAGE4_DST/qdrant_data"
cp -R "$STAGE4_SRC/qdrant_data" "$STAGE4_DST/qdrant_data"
rm -f "$STAGE4_DST/qdrant_data/.lock"
cp "$AGENTS_WORKSPACE/rag/config/production_pipeline.json" "$TUTOR_DIR/config/production_pipeline.json"
{
  echo "synced_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "agents_workspace: $AGENTS_WORKSPACE"
  echo "agents_git: $(git -C "$AGENTS_WORKSPACE" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  for f in embeddings.json knowledge_graph.json; do echo "$f: $(shasum -a 256 "$STAGE4_DST/$f" | cut -d' ' -f1)"; done
} > "$STAGE4_DST/SYNC_INFO.txt"
cat "$STAGE4_DST/SYNC_INFO.txt"

if [[ "$SYNC_CODE" -eq 1 ]]; then
  echo "==> code: $AGENTS_WORKSPACE/scripts/rag -> $TUTOR_DIR/core"
  for f in deeprag_search.py tutor_session.py thin_agent.py tutor_viz.py learner_model.py; do
    cp "$AGENTS_WORKSPACE/scripts/rag/$f" "$TUTOR_DIR/core/$f"
  done
  echo "NOTE: deeprag_search.py の [LMS port] パッチ（env 上書き・sentence-transformers 任意化）を再適用してください。"
  echo "      差分の正: tutor/README.md「研究側コードとの差分」"
fi
echo "done."
