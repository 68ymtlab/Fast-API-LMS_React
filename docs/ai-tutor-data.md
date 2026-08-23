# AI チューター — 会話の永続化・学生ごとの引き継ぎ・質問収集・教科書連携の設計

作成: 2026-08-23 / ブランチ: `feature/ai-tutor` / 前提: [`docs/ai-tutor.md`](ai-tutor.md)（配置の考察）

---

# 目的

1. **会話を Postgres に残し、学生ごとに引き継ぐ**（翌日・再起動後に「前回の続き」）
2. **質問内容を収集する**（教員が「誰がどこで詰まっているか」を見られる一次データ）
3. **知識ベース（KG・埋め込み）と会話ログを分離する**（KG は再構築され得る）
4. **教科書を見ながら質問できる**。開いているページの内容を AI が最初から持っている

---

# 方針

## 置き場: LMS の Postgres に `tutor` スキーマ

[`docs/ai-tutor.md`](ai-tutor.md) の推奨どおり、**DB コンテナは増やさず** LMS の `db`（Postgres 16）に `tutor` スキーマを作る。

- **所有者は tutor サービス**。`public` のテーブルには一切書かない。LMS backend は `tutor` を直接読まず、tutor サービスの `/admin/*` を経由する（教員権限の確認は backend 側）
- `public.users` への外部キーは張らない（退会後も学習ログを残す／スキーマの独立性）。`student_id` は `users.id` の値
- DDL は [`db/init/06-tutor-schema.sql`](../db/init/06-tutor-schema.sql)（新規 volume 用）と `tutor/app/store.py` の `DDL`（既存 volume 用に起動時 `IF NOT EXISTS` 適用）の二重管理。**両方を一致させる**
- 接続は `tutor/.env` の `TUTOR_DATABASE_URL`（未設定なら従来どおりメモリのみ＝研究側と同じ挙動。永続化は opt-in）

## KG と会話ログの分離（再構築に耐える形）

| 層 | 中身 | 変わる頻度 | 会話ログからの参照の仕方 |
|---|---|---|---|
| 知識ベース（ファイル） | `embeddings.json` / `knowledge_graph.json` | 研究側で再構築のたび | **参照しない**。代わりに `tutor.kb_versions` に「どの版で話したか」を記録 |
| `tutor.kb_versions` | 版の台帳（embeddings/KG の SHA-256、件数、同期日時） | 同期のたび 1 行追加 | `conversations.kb_version_id` |
| 引用（`turns.citations`） | `[{entity_id, section, type, excerpt}]` JSONB | — | `entity_id` は **文字列としての参照**（FK なし）。節名・抜粋を一緒に保存するので、KG が変わっても人が読める |
| スナップショット（`conversations.state_json`） | `SessionState` 全体 | ターンごと上書き | 復元時に **KG 依存フィールドだけ捨てる**（下記） |

復元ロジック（`tutor/app/state_io.py`）:

```
KG 非依存（常に復元）  : learner_state / known_topics / topic_level_log / dialogue / focus_concept / focus_section
KG 依存（同じ kb_version のときだけ）: focus_entity_id / last_results / last_context / last_citations /
                                    prerequisite_candidates / topic_stats
会話をまたいで持ち越す : learner_state / known_topics / topic_level_log（+ 挨拶用の focus_concept）
```

KG を再構築したら `sync_from_agents.sh` → tutor 再起動 → `kb_versions` に新しい行 → 以降の会話はその版を指す。古い会話は古い版の行を指したまま読める。

## 引き継ぎのルール

```
学生がチャットを開く（/api/tutor/open）
  ├ メモリにセッションあり → そのまま
  └ なし → DB の最新会話を見る
       ├ 未終了 かつ 最終活動から RESUME_WINDOW（既定 24h）以内 → 同じ会話を継続（履歴・待ち受け状態も復元）
       │     挨拶:「前回の続きです。『固有値』について話していました」
       └ それ以外 → 新しい会話。プロファイル（理解度・既知トピック）を種にする
             挨拶:「おかえりなさい。前回は『単位行列』を学んでいましたね（理解度: 聞いたことがある）」
```

- ターンごとに `turns` 2 行（学生＋チュータ）＋ `conversations.state_json` ＋ `learner_profiles` を更新
- 会話の終了: リセット（`end_reason=reset`、振り返りを `summary` に保存）／ TTL 30 分で退避（`ttl`）／ 上限超過（`evicted`）。**tutor の再起動では終了させない**（復元で続く）
- リセットしても理解度・既知トピックは残る（「会話」は新規、「学習者」は継続）

## 教科書を見ながら質問（page_context）

```
教科書ページ（/lesson/…）の 🤖 ボタン → 右サイドパネル（Sheet）に TutorChat
  フロント → backend /api/tutor/message { text, context: {course_id, lesson_item_id, lesson_page_id} }   … ID だけ送る
  backend  → lesson_pages + contents から本文を取得 → HTML 除去・6000 字に丸め → tutor へ page_context {title, text}
  tutor    → TutorSession.page_context に保持 →
             (a) プロンプトに「## 学生がいま開いている教科書ページ」ブロックを注入（「この式」「ここ」の指示対象）
             (b) 指示語だけの質問（「このEって何？」）は話題名・検索クエリにページタイトルを使う
             (c) 開いたときの挨拶でページ名に触れる（LLM 呼び出し無し）
```

- 本文は毎ターン backend が DB から引く（学生の改ざん不可、教員が編集した最新本文が反映される）
- `turns.lesson_page_id` に「どのページを見ながらの質問か」が残る → 教員ビューで「このページで詰まる学生が多い」が分かる
- 研究側コードへの変更は `deeprag_search.generate_answer/search` に `page_context` 引数、`tutor_session` に `page_context` 属性と話題名ヒント（`[LMS port]` コメント付き、計 4 箇所）

---

# スキーマ

```
tutor.kb_versions      id, label, embeddings_sha, kg_sha, entity_count, synced_at, registered_at
tutor.conversations    id, student_id, course_id, lesson_item_id, lesson_page_id, page_title, kb_version_id,
                       started_at, last_activity_at, ended_at, end_reason, turn_count, summary, state_json
tutor.turns            id, conversation_id, seq, role(student|tutor), text, choice_id, turn_class, explain_mode, phase,
                       knowledge_mode, retrieval_path, banner, focus_concept, focus_section, understanding_level, goal,
                       lesson_page_id, diagnosis, clarify, viz, citations, latency_ms, llm_model, created_at
tutor.question_exposures id, student_id, question_id, conversation_id, status_at_show, shown_at, revealed_at, clicked_at
tutor.learner_profiles student_id, understanding_level, goal, style, known_topics, topic_level_log,
                       last_focus_concept, last_focus_section, last_lesson_page_id, last_conversation_id,
                       conversation_count, turn_count, first_seen_at, updated_at
tutor.v_student_questions  (VIEW) 学生の発話だけ: student_id, course_id, lesson_page_id, page_title, question,
                       turn_class, focus_concept, understanding_level, created_at
```

容量の目安: 1 ターン ≈ 2〜6 KB（state_json は上書き）。1 クラス 40 人 × 週 20 ターン × 15 週 ≈ 12,000 行 ≈ 50 MB。気にする規模ではない。

---

# API

| 経路 | Method / Path | 内容 |
|---|---|---|
| 学生 | `POST /api/tutor/open` `{context?}` | 引き継ぎ判定・挨拶・（継続なら）履歴。LLM 不使用 |
| 学生 | `POST /api/tutor/message` `{text, choice_id?, context?}` | 1 ターン。`context` があれば backend がページ本文を解決して渡す |
| 学生 | `GET /api/tutor/history` | 現在の会話の履歴 |
| 学生 | `GET /api/tutor/summary` / `POST /api/tutor/reset` | 振り返り／会話をやり直す |
| 教員 | `GET /api/tutor/questions?course_id&student_id&since&limit` | 質問一覧（`tutor.v_student_questions`）。`require_teacher_or_higher` |

tutor サービス側（内部）: `/session/open|message|history|summary|state|reset`, `/admin/questions`, `/health`（`store` の件数付き）

---

# 実装済み（このブランチ）

- [x] `db/init/06-tutor-schema.sql`、`tutor/app/store.py`（psycopg3 プール・DDL 適用・保存・復元・質問一覧）、`tutor/app/state_io.py`
- [x] `tutor/app/main.py`: SessionManager の hydrate/復元、`/session/open`・`/session/history`・`/admin/questions`、page_context
- [x] 研究側コアへの `[LMS port]` パッチ（page_context）
- [x] backend: `context` → ページ本文解決、`/open`・`/history`・`/questions`
- [x] frontend: `TutorChat` 共通コンポーネント化、`/tutor` は履歴復元、教科書ページに 🤖 サイドパネル、数式内バックスラッシュ保護
- [x] 検証: 再起動後の復元（履歴 6 件・理解度）、指示語の話題名、リセット後の持ち越し、教員のみ質問一覧（学生は 403）、Playwright でサイドパネル動作

## 関連する演習問題（デモ）

研究側が却下したのは「LLM に問題を**生成**させる」こと。ここでは **教員が作った既存問題（`public.questions`）を検索して出す**だけなので方針に反しない。

```
回答を返したターン（診断/clarify 待ちでない）だけ:
  backend  → 有効な questions を全件（タイトル+問題文+空欄ラベル）→ tutor /related/rank { query: 焦点概念+学生の発話, candidates }
  tutor    → bge-m3（検索と同じ埋め込み API）でコサイン類似度。候補の埋め込みはハッシュでメモリキャッシュ
  backend  → 上位3件（類似度 0.48 以上・上位との差 0.07 以内）に、問題が入っている演習セットの URL を付けて
             message レスポンスの related_questions に同梱
  フロント → 回答の下に「関連する演習問題（教員が作成した問題から）」カード。展開で問題文、「答えを確認」（教員登録の正解）、
             「演習ページで解く」（既存の /weekflows/…/set/{id} へ）
```

- `GET /api/tutor/related-questions?q=…&course_id=…` 単体でも呼べる
- デモ用データ: `backend/scripts/seed_tutor_demo_questions.py`（線形代数 12 問 + 演習セット。`--remove` で撤去）。数式の行区切りは LMS の流儀で `\\\\` と二重化して保存する
- 並べ替え（実装済み）: 類似度を土台に、学生の解答履歴（`student_answers` ⋈ `exercise_sessions`）で **前回不正解 +0.08 / 未回答 +0.03 / 正解済み −0.05**、問い合わせ文にタグ名が含まれていれば +0.05、`student_competencies.mastery_level`（科目単位）があれば同点付近で難易度の並びを調整（高いほど難しい問題が先）。カードに「前回 不正解／未回答／正解済み」チップとタグを表示
- 絞り込み: `GET /api/tutor/related-questions?tag=行列式` でタグ一致の問題だけ。埋め込みテキストにもタグ名を含める（類似度が上がる）
- デモ seed はタグ（`線形代数` + 単元名）も投入する（`--remove` で孤立タグも片付ける）
- 繰り返し提示の抑止（実装済み）: 提示した問題を `tutor.question_exposures`（学生 × 問題 × 提示時刻・答えを見た・演習ページへ進んだ）に記録し、**過去 `TUTOR_EXPOSURE_COOLDOWN_DAYS`（既定 30、0=無期限）日以内に出した問題は除外。ただし status=wrong（前回不正解）は例外で再提示**（カードに「もう一度」チップ）。選定ロジックは tutor の `/related/rank` に集約（backend は候補＋正誤＋習熟度を渡すだけ）。「答えを確認」「演習ページで解く」は `POST /api/tutor/related-questions/{id}/event` で記録
- トピック固定（実装済み）: 問い合わせ（焦点概念＋発話）に単元タグ名が含まれていれば、そのタグの問題だけを候補にする（候補の半数以上に付く教科名タグは無視）。「不正解なら再提示」もこの中でしか効かないので、隣のトピックの不正解問題は混ざらない。類似度の下限は実測で 0.53（無関係 ≈0.50 / 関係あり 0.55〜0.66）
- 出し切ったとき: `related_meta.suppressed > 0` で「この話題の演習問題はすべて提示済みです。間違えた問題があれば、また出します」と一言
- その場で解く（実装済み）: カードには **1 問だけ**出し、numeric / multiple_numeric はその場で解答・採点（採点規則は既存演習ページ `checkAnswer` と同じ許容誤差つき数値比較）。保存は既存 API（`POST /exercise-sets/{id}/sessions` → `POST /exercise-sessions/{id}/answers`、`answer_data.source="tutor"` 付き）なので `student_answers` に入り、次回の「前回不正解／正解済み」判定と再提示ルールにそのまま効く。続けて解きたいときは「他の問題も解く（あと N 問）」で既存の演習ページへ（`related_meta.more` = 今回出さなかった解ける問題の数）。演習セットに入っていない問題は採点のみ（記録されない旨を表示）。答えは一度解答を試した後に見られる
- 次の段階: 教員が `difficulty` を付ければ習熟度連動が効く。不正解が続く問題は教員ビューで可視化

## 振り返り（深い版）

「振り返り」ボタンは tutor の `POST /session/reflect` を呼ぶ（backend `GET /api/tutor/summary` 経由）。材料は
(1) この会話の発話ログ（`tutor.turns`）、(2) SessionState（理解度・目的・トピック別到達・既知トピック）、
(3) LMS の最近の演習結果（`student_answers`、backend が `exercise` として添付）、(4) KG の前提／発展（焦点エンティティの `get_dependencies` / `get_dependents`、節名で集約）。
LLM 1 回（`response_format` の JSON Schema で拘束）で `{did, understood, stuck, next[{topic,why,how}], message}` を生成し、フロントは `ReflectionCard` で描画（Markdown に頼らない）。
失敗時は研究側テンプレ `summarize_weak_points()` にフォールバック。演習問題の生成はしない（次に学ぶことの提案だけ）。実装: `tutor/app/reflection.py`。

# 次にやること

1. **教員ビューの画面**（`/t/...`）: `GET /api/tutor/questions` を表で出す。ページ別・学生別の集計 SQL は `v_student_questions` に対する GROUP BY で足りる
2. **DB ロール分離**: 本番では `tutor` 専用ロール（`tutor` スキーマのみ）を作り、`TUTOR_DATABASE_URL` をそれにする（今は開発用に postgres ユーザ）
3. **フィードバック**（👍👎）: `tutor.turn_feedback(turn_id, rating, comment)` を足す。週次品質ループの入力
4. **ページ→KG 節の対応表**: LMS の `lesson_pages.title` と研究側 `section_index.json` の節タイトルを前方一致で対応付け、検索の一次候補をその節に寄せる（今は LLM プロンプトと話題名のヒントのみ）
5. **研究側の Phase 3（gap 特定の構造化出力）** を取り込む際、`turns` に `gap_hypothesis` 列を足す
6. 保持期間ポリシー（例: 卒業後 N 年で `turns.text` を匿名化）
