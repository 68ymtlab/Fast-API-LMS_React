-- AI チューター（tutor サービス）用スキーマ
--
-- 方針:
--   * tutor サービスだけが書き込む。LMS backend は読み取り（教員ビュー）のみ。public スキーマには触らない
--   * public.users への外部キーは張らない（退会後も学習ログを残す／スキーマ独立のため）。student_id = public.users.id
--   * 知識ベース（埋め込み・KG）は再構築され得るので、会話側は kb_versions の行を指すだけ。
--     引用（turns.citations）は entity_id を「参照文字列」として持つが FK ではなく、節名・抜粋を一緒に保存して
--     KG が変わっても読める形にする
--   * 新規 volume では init で流れるが、既存 volume では流れないため、tutor サービス起動時にも同じ DDL を
--     IF NOT EXISTS で適用する（tutor/app/store.py ensure_schema）。このファイルと store.py の DDL は一致させること

CREATE SCHEMA IF NOT EXISTS tutor;

-- 知識ベースのバージョン（sync_from_agents.sh で取り込んだ embeddings / KG の組）
CREATE TABLE IF NOT EXISTS tutor.kb_versions (
  id              SERIAL PRIMARY KEY,
  label           TEXT,
  embeddings_sha  TEXT NOT NULL,
  kg_sha          TEXT NOT NULL,
  entity_count    INTEGER,
  synced_at       TIMESTAMPTZ,
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (embeddings_sha, kg_sha)
);

-- 会話スレッド（学生 × 文脈）。学生1人につき「進行中」は原則1つ
CREATE TABLE IF NOT EXISTS tutor.conversations (
  id               BIGSERIAL PRIMARY KEY,
  student_id       INTEGER NOT NULL,
  course_id        INTEGER,
  lesson_item_id   INTEGER,
  lesson_page_id   INTEGER,
  page_title       TEXT,
  kb_version_id    INTEGER REFERENCES tutor.kb_versions(id),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at         TIMESTAMPTZ,
  end_reason       TEXT,          -- reset / ttl / restart / superseded
  turn_count       INTEGER NOT NULL DEFAULT 0,
  title            TEXT,          -- 一覧表示用。最初の質問から自動生成、学生が変更可
  summary          TEXT,          -- 終了時の振り返り（summarize_weak_points）
  state_json       JSONB          -- 最新の SessionState スナップショット（引き継ぎ用）
);
ALTER TABLE tutor.conversations ADD COLUMN IF NOT EXISTS title TEXT;
CREATE INDEX IF NOT EXISTS ix_tutor_conversations_student ON tutor.conversations (student_id, last_activity_at DESC);

-- 1発話 = 1行（学生の質問とチュータの返答の両方）。質問収集・品質ループの一次データ
CREATE TABLE IF NOT EXISTS tutor.turns (
  id                  BIGSERIAL PRIMARY KEY,
  conversation_id     BIGINT NOT NULL REFERENCES tutor.conversations(id) ON DELETE CASCADE,
  seq                 INTEGER NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('student', 'tutor')),
  text                TEXT NOT NULL,
  choice_id           TEXT,
  turn_class          TEXT,
  explain_mode        TEXT,
  phase               TEXT,
  knowledge_mode      TEXT,
  retrieval_path      TEXT,
  banner              TEXT,
  focus_concept       TEXT,
  focus_section       TEXT,
  understanding_level TEXT,
  goal                TEXT,
  lesson_page_id      INTEGER,       -- 発話時に開いていた教科書ページ
  diagnosis           JSONB,
  clarify             JSONB,
  viz                 JSONB,
  citations           JSONB,         -- [{entity_id, section, type, excerpt}] KG 非依存で読める形
  latency_ms          INTEGER,
  llm_model           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (conversation_id, seq)
);
CREATE INDEX IF NOT EXISTS ix_tutor_turns_created ON tutor.turns (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_tutor_turns_role_created ON tutor.turns (role, created_at DESC);

-- 学生ごとの長期プロファイル（会話をまたいで引き継ぐ最小集合。KG に依存しない値だけ）
CREATE TABLE IF NOT EXISTS tutor.learner_profiles (
  student_id          INTEGER PRIMARY KEY,
  understanding_level TEXT,
  goal                TEXT,
  style               TEXT,
  known_topics        JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic_level_log     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- topic -> {level, turns, confused, weak_hit}
  last_focus_concept  TEXT,
  last_focus_section  TEXT,
  last_lesson_page_id INTEGER,
  last_conversation_id BIGINT,
  answer_length       TEXT,                                 -- short / normal / long（学生の設定）
  conversation_count  INTEGER NOT NULL DEFAULT 0,
  turn_count          INTEGER NOT NULL DEFAULT 0,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE tutor.learner_profiles ADD COLUMN IF NOT EXISTS answer_length TEXT;

-- 教員ビュー用: 学生の質問一覧（チュータ返答を除外）
CREATE OR REPLACE VIEW tutor.v_student_questions AS
SELECT t.id, t.created_at, c.student_id, c.course_id, c.lesson_item_id,
       COALESCE(t.lesson_page_id, c.lesson_page_id) AS lesson_page_id,
       c.page_title, t.text AS question, t.turn_class, t.focus_concept, t.understanding_level,
       t.conversation_id, t.seq
FROM tutor.turns t
JOIN tutor.conversations c ON c.id = t.conversation_id
WHERE t.role = 'student';
