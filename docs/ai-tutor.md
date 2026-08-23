# AI チューター（線形代数 RAG）の LMS 移植 — 配置の考察と計画

作成: 2026-08-23 / ブランチ: `feature/ai-tutor`
移植元: `agents/workspace`（研究側。`scripts/rag/` + `rag/project/tutor-web/` + `rag/textbooks/linear-algebra/stage4_qdrant/`）

---

# 目的

研究側（agents/workspace）で検証済みの「線形代数 RAG チュータ」を、学生が LMS 上で使える形にする。

- 検証済みの中身（研究側の結論。詳細は `agents/workspace/rag/reports/`）
  - 検索: bge-m3 dense top-50 → ruri-v3-reranker-310m で top-5（`winner_v1`）。本番経路実測 Recall@5 0.91 / Hit@5 0.86 / hop2 0.71、p50 1.1秒
  - 回答: 文脈15件を LLM（Qwen3.8-27B, LiteLLM 経由）に渡し、表示出典は5件。教科書外は `knowledge_mode=extra` + バナーで明示
  - 対話: `TutorSession`（turn_class 分類 / 初回診断 A〜E / 混乱時は simplify → clarify / 次の一歩の提案 / VizSpec 図）。機械チェック 17/17
  - KG は検索に寄与しないが「前提を遡る・次の一歩」の教授機能の背骨として利用
  - 研究側の既決事項: **RAG レイヤーは LMS から独立させる**（負荷分離・横展開。`AGENTS.md`「DBアーキテクチャに関する検討」）、演習のその場生成はしない、回答毎の強制 probe はしない（`tutoring_system_architecture.md`）

---

# 方針（配置の考察）

## 選択肢

| 案 | 概要 | 長所 | 短所 |
|----|------|------|------|
| **A. LMS リポジトリ内の独立サービス `tutor/` + backend が BFF プロキシ**（採用） | `docker-compose` に `tutor` サービスを追加。フロントは `/api/tutor/*` だけを叩き、backend が JWT 検証後に内部ネットワークで tutor へ転送 | ・研究側の「独立させる」決定と一致 ・backend は `--workers 4` なので、プロセス内に載せると 21MB の埋め込み＋BM25＋Qdrant ローカルが4重化し、Qdrant ローカルモード（`path=`）は多プロセス不可・セッション状態もプロセス間で割れる。これを回避 ・Python バージョン／依存（numpy, qdrant-client, openai…）を backend の Poetry 環境に混ぜない ・tutor が落ちても LMS 本体は無事（`depends_on` しない） ・同じリポジトリ／同じ compose なので運用（deploy.sh, nginx）は一本のまま | ・コンテナが1つ増える ・backend→tutor のホップが1回増える（数 ms） |
| B. backend（`backend/api/`）のモジュールとして組み込み | `api/tutor/` パッケージ + ルーター | ・コンテナ追加なし | ・上記の多ワーカー問題（状態・メモリ・Qdrant ロック）が直撃。回避には外部セッションストア＋Qdrant サーバ化が必要で、結局「独立サービス」相当の作業になる ・研究側コード更新のたびに backend を再ビルド |
| C. 研究側の `tutor-web` をそのまま動かし、LMS からリンク/iframe | 最小工数 | ・単一セッション前提で学生が混線する ・LMS の認証と無関係・CORS/Cookie の二重管理 ・研究用 workspace が本番依存になる | 
| D. 別リポジトリ・別デプロイ（完全分離マイクロサービス） | 研究側の「横展開」には最も素直 | ・LMS 以外の利用者が現れるまではデプロイ・ネットワーク・認証の二重管理コストだけ増える ・`tutoring_system_architecture.md` §6 も「マイクロサービス分割はやらない」 | 

**結論: A。** 「独立したプロセス」は守りつつ、「独立したリポジトリ／デプロイ」までは行かない。将来 D に移す場合も `tutor/` ディレクトリを切り出すだけで済む構造にしてある（LMS 固有の知識は backend の `tutor_router.py` 側にしか無い）。

## リポジトリ内の置き場

```
Fast-API-LMS_React/
├── tutor/                     ← 新規: AI チューター サービス（独立コンテナ）
│   ├── app/main.py            ← FastAPI（学生ごとの SessionManager。tutor-web の tutor_web.py 相当）
│   ├── core/                  ← 研究側 scripts/rag/ から移植（deeprag_search / tutor_session / thin_agent / tutor_viz / learner_model）
│   ├── config/production_pipeline.json
│   ├── data/stage4/           ← git 管理外。embeddings.json / knowledge_graph.json / qdrant_data（sync_from_agents.sh で取り込み）
│   ├── scripts/sync_from_agents.sh
│   ├── Dockerfile / requirements.txt / .env.example
│   └── README.md
├── backend/api/routers/tutor_router.py   ← 新規: /api/tutor/* （JWT 認証 → tutor へ中継）
├── backend/api/core/config.py            ← TUTOR_SERVICE_URL / TUTOR_SERVICE_TOKEN 追加
├── frontend/server/src/app/(students)/tutor/   ← 新規: チャット画面（page.tsx, components/TutorViz.tsx）
├── frontend/server/src/router/router.ts        ← student/demo に "/tutor" 追加
├── frontend/server/src/app/(students)/layout.tsx ← サイドバーに「AIチューター」
├── docker-compose.yml / docker-compose.prod.yml  ← tutor サービス追加（prod は ports を閉じ data のみ ro マウント）
└── docs/ai-tutor.md    ← このファイル
```

## 通信・認証

```
ブラウザ ──(NextAuth JWT)──▶ nginx /api/ ──▶ backend /api/tutor/*  ──(X-Student-Id=users.id, X-Tutor-Token)──▶ tutor:8765 /session/*
                                                                                                              ├─▶ LiteLLM :14000 /v1/chat, /v1/embeddings
                                                                                                              └─▶ vLLM Manager :18000 /rerank
```

- 学生の識別は **backend が JWT から得た `users.id`** を使う。フロントから student_id は送らせない（なりすまし防止）
- `tutor` コンテナは本番では `ports` を公開しない。加えて共有シークレット `TUTOR_SERVICE_TOKEN` で backend 以外からの呼び出しを弾ける
- nginx の `/api/` は `proxy_read_timeout 120s`。1ターンは実測 3〜6秒（最大でも 30秒弱）なので現状の非ストリーミングで収まる。将来 SSE にする場合は `proxy_buffering off` が必要

## データの扱い

- `tutor/data/` は **git 管理外**（約30MB、バイナリの qdrant ストア含む）。`./tutor/scripts/sync_from_agents.sh` で研究側から取り込み、`SYNC_INFO.txt` に同期元コミット・ハッシュを残す
- 研究側が正（教科書追加・再埋め込みは研究側で行い、LMS には同期するだけ）
- 将来、教員が LMS 上で教科書を編集したものを RAG に反映したくなった場合は、LMS の `contents.content_body` → 研究側パイプライン（Stage1〜4）への入力、という向きで接続する（LMS backend から直接 Qdrant を触らない）

## 研究側コードとの差分（再同期時に再適用が必要）

`tutor/core/deeprag_search.py` のみ、以下2点の最小パッチ（`[LMS port]` コメントで印）:
1. `TUTOR_STAGE4_DIR` / `TUTOR_PROD_CFG` 環境変数でデータ・設定パスを上書き可能に（既定は研究側と同じ相対配置）
2. `sentence_transformers` の import を任意化（本番経路は vLLM 埋め込み／リランクなので torch 不要。イメージ 454MB に収まる。ローカルモデルを使う場合は `requirements-local-models.txt`）

他4ファイル（tutor_session / thin_agent / tutor_viz / learner_model）は無改変。

---

# 実装TODO

## 完了（このブランチ）

1. **tutor サービス** — `tutor/`（上記）。ローカル venv と Docker の両方で起動確認。実 LLM で end-to-end（診断 → 回答 5〜6秒、出典3件、VizSpec、振り返り）、学生2人の独立セッションを確認
2. **backend BFF** — `tutor_router.py`（`/api/tutor/health|message|summary|state|reset`）、`Settings` に `TUTOR_SERVICE_URL`/`TUTOR_SERVICE_TOKEN`、`pyproject` に `httpx`、`.env.example` 追記。稼働中 backend コンテナで JWT ログイン → `/api/tutor/*` 全経路確認、未認証 401
3. **フロント** — `(students)/tutor/page.tsx` + `TutorViz.tsx`。router / サイドバー登録。biome・tsc クリーン（既存の layout.tsx 警告は対象外）。**ブラウザでの目視は未実施**
4. **compose** — dev: `127.0.0.1:8765` 公開＋ソース bind（`--reload`）。prod: `ports` 閉鎖・`volumes: !override` で data のみ ro・healthcheck
5. 本ドキュメント、`tutor/README.md`

> 2026-08-23 追記: 会話の永続化（Postgres `tutor` スキーマ）・学生ごとの引き継ぎ・質問収集・教科書ページ連携は
> [`docs/ai-tutor-data.md`](ai-tutor-data.md) に設計と実装をまとめた。下の TODO 5・6 はそちらで実施済み。

## 次にやること（優先順）

1. **ブラウザで `/tutor` を目視**（ログイン後）。MathJax の数式レンダリング、診断ボタン、出典の折りたたみ、図の表示
2. **`tutor/.env` の本番値**（`ANTHROPIC_AUTH_TOKEN`, `VLLM_MANAGER_TOKEN`, `TUTOR_SERVICE_TOKEN` を backend 側と揃える）。`docs/runbook-secret-rotation.md` に追記
3. **`scripts/deploy.sh` に tutor を含める**か確認（`docker compose up --build` なら自動で含まれる。データ同期 `sync_from_agents.sh` は deploy 前に手で実行）
4. **学内プロキシ前提のビルド引数**: 学外からは `docker build --build-arg HTTP_PROXY= ...` が必要（backend/frontend と同じ既存の癖）
5. 教科書ページへの埋め込み（`(students)/lesson/[course_id]/[lesson_id]/[page]/page.tsx` にサイドパネルで「このページについて聞く」）。tutor 側は `focus`/`section` ヒントを受け取る拡張が要る（研究側 Phase 4 CurriculumMap と合わせて）
6. 研究側ロードマップの Phase 2（LearnerProfile の永続化）。LMS 側では `student_competencies` と突き合わせる余地がある。置き場は tutor 内の SQLite か LMS の Postgres か要判断（研究側は SQLite 想定）
7. テレメトリ（JSONL）と教員ビュー（Phase 5）

## やらないこと（研究側の決定を踏襲）

演習のその場生成 / 回答毎の強制 probe / 検索への KG 利用 / マイクロサービス分割（別リポジトリ化）
