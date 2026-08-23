# tutor — AI チューター サービス（線形代数 RAG）

研究側 `agents/workspace` で検証した線形代数チュータを、LMS 用の**独立コンテナ**として動かす。
配置の考察・全体像は [`docs/ai-tutor.md`](../docs/ai-tutor.md)。

```
tutor/
├── app/main.py          FastAPI。学生ごとの TutorSession（SessionManager, TTL 30分）
├── core/                研究側 scripts/rag/ からの移植（deeprag_search, tutor_session, thin_agent, tutor_viz, learner_model）
├── config/production_pipeline.json
├── data/stage4/         実データ（git 管理外）。scripts/sync_from_agents.sh で取り込む
├── scripts/sync_from_agents.sh
├── Dockerfile / requirements.txt / requirements-local-models.txt
└── .env.example         → .env を作る
```

## 起動（LMS の compose から）

```bash
cp tutor/.env.example tutor/.env          # トークンを埋める
./tutor/scripts/sync_from_agents.sh       # 研究側から embeddings / KG / qdrant を取り込む
docker compose up -d --build tutor        # 学外からは proxy の build-arg を空にする（下記）
curl http://127.0.0.1:8765/health         # {"ok":true,...}
```

学外ネットワークでは compose 既定の学内プロキシに届かないので:

```bash
docker build -t fast-api-lms_react-tutor:latest \
  --build-arg HTTP_PROXY= --build-arg HTTPS_PROXY= --build-arg http_proxy= --build-arg https_proxy= tutor/
docker compose up -d --no-build tutor
```

## Docker なしで動かす（デバッグ用）

```bash
uv venv -p 3.12 .venv-tutor && uv pip install -p .venv-tutor/bin/python -r tutor/requirements.txt
cd tutor
TUTOR_STAGE4_DIR=$PWD/data/stage4 TUTOR_PROD_CFG=$PWD/config/production_pipeline.json \
LITELLM_URL=http://hinton.kanazawa-it.ac.jp:14000 ANTHROPIC_BASE_URL=http://hinton.kanazawa-it.ac.jp:14000 \
VLLM_MANAGER_URL=http://hinton.kanazawa-it.ac.jp:18000 ANTHROPIC_AUTH_TOKEN=... VLLM_MANAGER_TOKEN=... \
../.venv-tutor/bin/python -m uvicorn app.main:app --port 8765
```

## API（内部用。フロントからは backend の `/api/tutor/*` を使う）

| Method | Path | 説明 |
|--------|------|------|
| GET | `/health` | 生存確認 + セッション数 |
| POST | `/session/message` | `{"text":"...", "choice_id":null}` → 返答（reply / state / diagnosis / clarify / citations / knowledge_mode / banner / viz …） |
| GET | `/session/summary` | 弱点まとめ |
| GET | `/session/state` | セッションの有無とデバッグ状態 |
| POST | `/session/reset` | セッションをやり直す（直前のまとめを返す） |

すべて `X-Student-Id` ヘッダ必須（LMS backend が JWT から `users.id` を入れる）。`TUTOR_SERVICE_TOKEN` を設定した場合は `X-Tutor-Token` も必須。

## 外部依存

| 種類 | 既定 | 環境変数 |
|------|------|----------|
| LLM（chat）/ 埋め込み（bge-m3） | LiteLLM `hinton.kanazawa-it.ac.jp:14000` | `LITELLM_URL` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_DEFAULT_SONNET_MODEL` |
| リランカー（ruri-v3-310m） | vLLM Manager `hinton.kanazawa-it.ac.jp:18000/rerank` | `VLLM_MANAGER_URL` / `VLLM_MANAGER_TOKEN` |

埋め込み・リランカーが GPU 側で起動していない場合の起動手順は研究側 `rag/project/tutor-web/run.sh` を参照（`start-rag-embedding.sh` / `start-rag-reranker.sh`）。

## 研究側コードとの差分

`core/deeprag_search.py` のみ `[LMS port]` コメント付きの最小パッチ2点（パス上書き env、`sentence_transformers` の任意化）。
再同期（`sync_from_agents.sh --code`）後はこの2点を再適用すること。他ファイルは無改変。

## 移植元（2026-08-23 時点）

- `agents/workspace` git `4f465fc`
- `scripts/rag/{deeprag_search,tutor_session,thin_agent,tutor_viz,learner_model}.py`
- `rag/project/tutor-web/app/tutor_web.py`（→ `app/main.py`）、`tutor_web.html`（→ `frontend/.../(students)/tutor/`）
- `rag/config/production_pipeline.json` v1.5
- `rag/textbooks/linear-algebra/stage4_qdrant/{embeddings.json,knowledge_graph.json,qdrant_data/}`
