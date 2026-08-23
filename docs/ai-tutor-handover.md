# AI チューター — 引き継ぎ: あなたがやること

作成: 2026-08-23 / ブランチ `feature/ai-tutor`（未 push）/ 詳細設計は [`ai-tutor.md`](ai-tutor.md)・[`ai-tutor-data.md`](ai-tutor-data.md)・今後と問題作成は [`ai-tutor-roadmap-and-problem-authoring.md`](ai-tutor-roadmap-and-problem-authoring.md)

開発環境（このマシンの docker compose）では全部動いています。本番に出すまで・出した後に **人がやる必要があること** だけをまとめます。

---

## A. いますぐ（ブランチの整理）

- [ ] `feature/ai-tutor` を push して PR を作る（ベースは `feature/setup-lab`）。コミットは全部ローカルのみ。
      差分の概要は [`ai-tutor.md`](ai-tutor.md) / [`ai-tutor-data.md`](ai-tutor-data.md) と、このブランチのコミットログ
- [ ] 開発 DB のテストデータを消すか決める（私の検証で入ったもの。消さなくても LMS 本体には無関係）
  ```bash
  # 架空の学生 ID（9001/9002）の会話だけ消す
  docker exec lms-db psql -U postgres -d lms -c "delete from tutor.conversations where student_id in (9001,9002); delete from tutor.learner_profiles where student_id in (9001,9002);"
  # デモの演習問題（線形代数 12 問＋演習セット＋タグ）を消す
  docker compose exec backend poetry run python scripts/seed_tutor_demo_questions.py --remove
  ```

## B. 本番に出す前（1 回だけ）

1. [ ] **研究側から知識ベースを同期**（研究側ディレクトリが見えるマシンで）
   ```bash
   ./tutor/scripts/sync_from_agents.sh        # → tutor/data/stage4/{embeddings.json,knowledge_graph.json,qdrant_data/,SYNC_INFO.txt}
   ```
   本番サーバーから `agents/workspace` が見えない場合は、同期済みの `tutor/data/stage4/` ごと scp 等でコピーする（git 管理外、約 30MB）
2. [ ] **`tutor/.env` を作る**（`tutor/.env.example` から）。埋めるもの:
   - `ANTHROPIC_AUTH_TOKEN`（LiteLLM ゲートウェイ hinton:14000 のキー）
   - `VLLM_MANAGER_TOKEN`（リランカー hinton:18000）
   - `ANTHROPIC_DEFAULT_SONNET_MODEL`（起動時の既定モデル。後から管理画面で変えられる）
   - `TUTOR_MODEL_CHOICES`（管理画面の候補。カンマ区切り）
3. [ ] **共有シークレットと専用 DB ロール**（db コンテナが起動している状態で）
   ```bash
   ./scripts/setup_tutor_secrets.sh           # TUTOR_SERVICE_TOKEN を backend/.env と tutor/.env に、tutor_app ロールを DB に
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend tutor   # restart では env を再読込しない
   ```
4. [ ] **GPU 側（hinton）で埋め込みとリランカーが動いていること**を確認。起動は研究側の
   `agents/workspace/rag/skills/vllm-manager/scripts/start-rag-embedding.sh` / `start-rag-reranker.sh`
   （`rag/project/tutor-web/run.sh` が呼んでいるもの）。止まっていると tutor は起動はするが回答でエラーになる
5. [ ] **デプロイ** — `./scripts/deploy.sh`。tutor 用のチェック（`tutor/.env`・トークン・知識ベース・起動確認）は組み込み済み。
   既存の本番 DB には、tutor が起動時に `tutor` スキーマを `IF NOT EXISTS` で作る（手作業のマイグレーション不要）
6. [ ] **動作確認**（本番 URL で）
   - 学生でログイン → サイドバー「AIチューター」→ 質問 → 回答が返る（初回は知識ベース読み込みで数十秒待つ）
   - 教科書ページの 🤖 → このページについて質問できる
   - 教員でログイン → 「AIチューター分析」に質問が出る
   - 管理者で「AIチューター分析 → 設定」→ モデル名と 永続化 on を確認

## C. 運用（定期的に）

- **週次**: 教員ビュー `/t/tutor` の「週次の品質」「フィードバック」を見る。👎 のコメントと「つまずく演習問題」は研究側（プロンプト・検索）の改善材料。SQL で取るなら
  `SELECT * FROM tutor.v_weekly_quality;` と `SELECT * FROM tutor.turn_feedback ORDER BY created_at DESC;`
- **知識ベースを更新したとき**（研究側で教科書追加・再埋め込み・KG 再構築）
  ```bash
  ./tutor/scripts/sync_from_agents.sh && docker compose up -d tutor    # 新しい kb_version が登録される。過去の会話は壊れない
  ```
- **研究側のコード更新を取り込むとき**（Phase 3 など）
  ```bash
  ./tutor/scripts/sync_from_agents.sh --code
  # → tutor/core/ の [LMS port] パッチを再適用（deeprag_search: パス env・torch 任意化・page_context・answer_length・節ヒント /
  #    tutor_session: page_context・_page_hint・answer_length）。grep '\[LMS port\]' で箇所が分かる。その後 docker compose up -d --build tutor
  ```
- **モデルを替えたいとき**: 管理者で `/t/tutor` →「設定」→ 候補から選ぶ or 名前を入力 → 「このモデルに切り替える」。再起動不要・次回起動後も保持。
  env の `ANTHROPIC_DEFAULT_SONNET_MODEL` は起動時の既定値で、画面の設定が優先。埋め込み／リランカーは替えられない（知識ベースと紐づく）
- **シークレットのローテーション**: `./scripts/setup_tutor_secrets.sh --rotate` → `docker compose up -d backend tutor`
- **tutor が落ちても LMS 本体は動く**（backend は tutor に依存しない）。復旧は `docker compose up -d tutor`、ログは `docker compose logs --tail=100 tutor`

## D. 教員にお願いすること（効果が出るデータ整備）

- 演習問題に **難易度（difficulty）** と **タグ（単元名）** を付ける → 関連問題の「習熟度×難易度」と「トピック固定」が効く
- 教科書ページと知識ベースの節の対応（`/t/tutor` →「ページ→節」）を一度見て、違うところを上書き（管理者が保存）

## E. やらないと決めていること（研究側の決定）

演習問題の LLM 生成／回答毎の強制クイズ／検索への KG 利用／マイクロサービス分割（別リポジトリ化）／KG 用 DB の新設（ファイルのまま）
