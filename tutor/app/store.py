"""tutor スキーマへの永続化（psycopg3, 同期）。

LMS の Postgres（db コンテナ）内の `tutor` スキーマだけを読み書きする。public には触らない。
TUTOR_DATABASE_URL が未設定なら無効化され、従来どおりメモリのみで動く（研究側と同じ挙動）。
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool, PoolTimeout
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    ConnectionPool = None  # type: ignore[assignment,misc]
    PoolTimeout = None  # type: ignore[assignment,misc]


class StudentBusy(Exception):
    """同じ学生のリクエストが同時に上限を超えた（1人の連打が他の学生を止めないよう、待たせずに断る）。"""


class LockUnavailable(Exception):
    """ロック用の接続を待っても確保できなかった（全体が混雑している）。"""

# db/init/06-tutor-schema.sql と同じ DDL（既存 volume には init が流れないため起動時に適用）
DDL = [
    "CREATE SCHEMA IF NOT EXISTS tutor",
    """CREATE TABLE IF NOT EXISTS tutor.kb_versions (
      id SERIAL PRIMARY KEY, label TEXT, embeddings_sha TEXT NOT NULL, kg_sha TEXT NOT NULL,
      entity_count INTEGER, synced_at TIMESTAMPTZ,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (embeddings_sha, kg_sha))""",
    """CREATE TABLE IF NOT EXISTS tutor.conversations (
      id BIGSERIAL PRIMARY KEY, student_id INTEGER NOT NULL,
      course_id INTEGER, lesson_item_id INTEGER, lesson_page_id INTEGER, page_title TEXT,
      kb_version_id INTEGER REFERENCES tutor.kb_versions(id),
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMPTZ, end_reason TEXT, turn_count INTEGER NOT NULL DEFAULT 0,
      title TEXT, summary TEXT, state_json JSONB)""",
    "ALTER TABLE tutor.conversations ADD COLUMN IF NOT EXISTS title TEXT",
    "CREATE INDEX IF NOT EXISTS ix_tutor_conversations_student ON tutor.conversations (student_id, last_activity_at DESC)",
    """CREATE TABLE IF NOT EXISTS tutor.turns (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL REFERENCES tutor.conversations(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL, role TEXT NOT NULL CHECK (role IN ('student','tutor')),
      text TEXT NOT NULL, choice_id TEXT, turn_class TEXT, explain_mode TEXT, phase TEXT,
      knowledge_mode TEXT, retrieval_path TEXT, banner TEXT, focus_concept TEXT, focus_section TEXT,
      understanding_level TEXT, goal TEXT, lesson_page_id INTEGER,
      diagnosis JSONB, clarify JSONB, viz JSONB, citations JSONB,
      latency_ms INTEGER, llm_model TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (conversation_id, seq))""",
    "ALTER TABLE tutor.turns ADD COLUMN IF NOT EXISTS planner_json JSONB",
    "CREATE INDEX IF NOT EXISTS ix_tutor_turns_created ON tutor.turns (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_tutor_turns_role_created ON tutor.turns (role, created_at DESC)",
    """CREATE TABLE IF NOT EXISTS tutor.learner_profiles (
      student_id INTEGER PRIMARY KEY, understanding_level TEXT, goal TEXT, style TEXT,
      known_topics JSONB NOT NULL DEFAULT '[]'::jsonb, topic_level_log JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_focus_concept TEXT, last_focus_section TEXT, last_lesson_page_id INTEGER, last_conversation_id BIGINT,
      conversation_count INTEGER NOT NULL DEFAULT 0, turn_count INTEGER NOT NULL DEFAULT 0,
      answer_length TEXT,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)""",
    "ALTER TABLE tutor.learner_profiles ADD COLUMN IF NOT EXISTS answer_length TEXT",
    """CREATE TABLE IF NOT EXISTS tutor.active_sessions (
      student_id INTEGER PRIMARY KEY,
      conversation_id BIGINT REFERENCES tutor.conversations(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)""",
    """CREATE TABLE IF NOT EXISTS tutor.question_exposures (
      id BIGSERIAL PRIMARY KEY, student_id INTEGER NOT NULL, question_id INTEGER NOT NULL, conversation_id BIGINT,
      status_at_show TEXT, shown_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revealed_at TIMESTAMPTZ, clicked_at TIMESTAMPTZ)""",
    "CREATE INDEX IF NOT EXISTS ix_tutor_exposures_student ON tutor.question_exposures (student_id, shown_at DESC)",
    """CREATE TABLE IF NOT EXISTS tutor.turn_feedback (
      id BIGSERIAL PRIMARY KEY, turn_id BIGINT REFERENCES tutor.turns(id) ON DELETE CASCADE, conversation_id BIGINT,
      student_id INTEGER NOT NULL, rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)), comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE (turn_id, student_id))""",
    """CREATE TABLE IF NOT EXISTS tutor.settings (
      key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_by INTEGER, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)""",
    """CREATE OR REPLACE VIEW tutor.v_weekly_quality AS
      SELECT date_trunc('week', t.created_at)::date AS week,
             COUNT(*) FILTER (WHERE t.role = 'tutor') AS answers,
             COUNT(DISTINCT c.student_id) AS students,
             COUNT(*) FILTER (WHERE t.role = 'tutor' AND t.knowledge_mode = 'extra') AS extra_knowledge,
             COUNT(*) FILTER (WHERE t.role = 'tutor' AND t.turn_class = 'confused') AS confused,
             COUNT(*) FILTER (WHERE t.role = 'tutor' AND t.clarify IS NOT NULL) AS clarify,
             ROUND(AVG(t.latency_ms) FILTER (WHERE t.role = 'tutor'))::int AS avg_latency_ms,
             COALESCE(fb.thumbs_up, 0) AS thumbs_up,
             COALESCE(fb.thumbs_down, 0) AS thumbs_down
      FROM tutor.turns t JOIN tutor.conversations c ON c.id = t.conversation_id
      LEFT JOIN (SELECT date_trunc('week', created_at)::date AS week,
                        COUNT(*) FILTER (WHERE rating = 1) AS thumbs_up, COUNT(*) FILTER (WHERE rating = -1) AS thumbs_down
                 FROM tutor.turn_feedback GROUP BY 1) fb ON fb.week = date_trunc('week', t.created_at)::date
      GROUP BY 1, fb.thumbs_up, fb.thumbs_down ORDER BY 1 DESC""",
    """CREATE OR REPLACE VIEW tutor.v_student_questions AS
      SELECT t.id, t.created_at, c.student_id, c.course_id, c.lesson_item_id,
             COALESCE(t.lesson_page_id, c.lesson_page_id) AS lesson_page_id,
             c.page_title, t.text AS question, t.turn_class, t.focus_concept, t.understanding_level,
             t.conversation_id, t.seq
      FROM tutor.turns t JOIN tutor.conversations c ON c.id = t.conversation_id
      WHERE t.role = 'student'""",
]


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _jsonb(v: Any):
    if v is None:
        return None
    return psycopg.types.json.Jsonb(v)  # type: ignore[union-attr]


class TutorStore:
    """tutor スキーマの読み書き。enabled=False のときは全メソッドが no-op / None を返す。"""

    def __init__(self, dsn: str | None):
        self.dsn = (dsn or "").strip()
        self.enabled = bool(self.dsn) and ConnectionPool is not None
        self.pool: ConnectionPool | None = None
        self.lock_pool: ConnectionPool | None = None
        self.kb_version_id: int | None = None
        self._lock = threading.Lock()
        # 1人の学生が同時に持てるリクエスト数（実行中 + 待機中）。超えた分は待たせずに断る。
        # 待機中のリクエストもロック用接続を1本握るので、上限が無いと1人の連打で全接続を使い切れてしまう
        self.max_inflight = max(1, int(os.environ.get("TUTOR_MAX_INFLIGHT_PER_STUDENT", "3")))
        # ロック用接続を待つ最大秒数。超えたら LockUnavailable
        self.lock_wait_sec = max(1.0, float(os.environ.get("TUTOR_LOCK_WAIT_SEC", "30")))
        self._inflight: dict[int, int] = {}
        self._inflight_guard = threading.Lock()

    # ---- lifecycle ----
    def connect(self, stage4_dir: str | None, entity_count: int | None) -> None:
        if not self.enabled:
            require = os.environ.get("TUTOR_REQUIRE_PERSISTENCE", "0").strip().lower() in ("1", "true", "yes")
            if require:
                raise RuntimeError("TUTOR_REQUIRE_PERSISTENCE is enabled but TUTOR_DATABASE_URL/psycopg is unavailable")
            print("  [store] TUTOR_DATABASE_URL 未設定 → 永続化オフ（メモリのみ）", flush=True)
            return
        last_exc: Exception | None = None
        for attempt in range(1, 11):  # db コンテナの起動待ち（最大 ~30 秒）
            try:
                self.pool = ConnectionPool(self.dsn, min_size=1, max_size=4, kwargs={"row_factory": dict_row}, open=True)
                with self.pool.connection() as conn:
                    # tutor_app のような専用ロールは DB に CREATE 権限が無いので、スキーマは「無いときだけ」作る
                    has_schema = conn.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'tutor'").fetchone()
                    for stmt in DDL:
                        if stmt.startswith("CREATE SCHEMA") and has_schema:
                            continue
                        conn.execute(stmt)
                    conn.commit()
                # Keep cross-process student locks on a separate pool: a lock is held while the LLM runs,
                # and must not consume the connections used to save/read turns.
                lock_pool_max = max(1, int(os.environ.get("TUTOR_DB_LOCK_POOL_MAX", "16")))
                self.lock_pool = ConnectionPool(self.dsn, min_size=1, max_size=lock_pool_max,
                                                kwargs={"row_factory": dict_row}, open=True)
                last_exc = None
                break
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                print(f"  [store] DB 接続待ち ({attempt}/10): {exc}", flush=True)
                if self.pool is not None:
                    self.pool.close()
                    self.pool = None
                if self.lock_pool is not None:
                    self.lock_pool.close()
                    self.lock_pool = None
                time.sleep(3)
        if last_exc is not None:
            raise RuntimeError(f"tutor スキーマに接続できません: {last_exc}") from last_exc
        self.kb_version_id = self._register_kb_version(stage4_dir, entity_count)
        print(f"  [store] 永続化オン（kb_version_id={self.kb_version_id}）", flush=True)

    def close(self) -> None:
        if self.pool is not None:
            self.pool.close()
        if self.lock_pool is not None:
            self.lock_pool.close()

    @contextmanager
    def student_lock(self, student_id: int):
        """Serialize one student's tutor requests across workers and containers.

        - 1人の学生の同時リクエストは max_inflight まで。超えたら StudentBusy で即座に断る
          （待機中も接続を握るため、断らないと1人の連打でロック用接続を使い切り、全員が止まる）
        - ロック用接続は lock_wait_sec までしか待たない。超えたら LockUnavailable
        """
        if not self.enabled or self.lock_pool is None:
            yield
            return
        with self._inflight_guard:
            n = self._inflight.get(student_id, 0)
            if n >= self.max_inflight:
                raise StudentBusy(student_id)
            self._inflight[student_id] = n + 1
        try:
            # Two-key advisory locks avoid creating a lock row for every student. The lock connection is
            # separate from the query pool because it remains checked out for the duration of LLM calls.
            try:
                conn = self.lock_pool.getconn(timeout=self.lock_wait_sec)
            except PoolTimeout as exc:
                raise LockUnavailable(student_id) from exc
            try:
                conn.execute("SELECT pg_advisory_lock(1414872146, %s)", (student_id,))
                conn.commit()
                try:
                    yield
                finally:
                    conn.execute("SELECT pg_advisory_unlock(1414872146, %s)", (student_id,))
                    conn.commit()
            finally:
                self.lock_pool.putconn(conn)
        finally:
            with self._inflight_guard:
                left = self._inflight.get(student_id, 1) - 1
                if left > 0:
                    self._inflight[student_id] = left
                else:
                    self._inflight.pop(student_id, None)

    def active_session(self, student_id: int) -> tuple[bool, int | None]:
        """Return (row_exists, conversation_id); a NULL pointer means the student explicitly started fresh."""
        if not self.enabled:
            return False, None
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            row = conn.execute(
                "SELECT conversation_id FROM tutor.active_sessions WHERE student_id = %s", (student_id,)
            ).fetchone()
        return (True, int(row["conversation_id"]) if row and row["conversation_id"] is not None else None) if row else (False, None)

    def set_active_session(self, student_id: int, conversation_id: int | None) -> bool:
        """Persist the currently selected conversation, validating that it belongs to this student."""
        if not self.enabled:
            return False
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            if conversation_id is None:
                conn.execute(
                    """INSERT INTO tutor.active_sessions (student_id, conversation_id) VALUES (%s, NULL)
                       ON CONFLICT (student_id) DO UPDATE SET conversation_id = NULL, updated_at = CURRENT_TIMESTAMP""",
                    (student_id,),
                )
                conn.commit()
                return True
            row = conn.execute(
                """INSERT INTO tutor.active_sessions (student_id, conversation_id)
                   SELECT %s, id FROM tutor.conversations
                   WHERE id = %s AND student_id = %s AND COALESCE(end_reason, '') <> 'deleted'
                   ON CONFLICT (student_id) DO UPDATE
                     SET conversation_id = EXCLUDED.conversation_id, updated_at = CURRENT_TIMESTAMP
                   RETURNING conversation_id""",
                (student_id, conversation_id, student_id),
            ).fetchone()
            conn.commit()
        return row is not None

    def active_session_count(self) -> int:
        if not self.enabled:
            return 0
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            row = conn.execute("SELECT COUNT(*) AS n FROM tutor.active_sessions WHERE conversation_id IS NOT NULL").fetchone()
        return int(row["n"]) if row else 0

    def _register_kb_version(self, stage4_dir: str | None, entity_count: int | None) -> int | None:
        if not stage4_dir:
            return None
        d = Path(stage4_dir)
        emb, kg = d / "embeddings.json", d / "knowledge_graph.json"
        if not emb.exists() or not kg.exists():
            return None
        emb_sha, kg_sha = _sha256(emb), _sha256(kg)
        synced_at = None
        label = None
        info = d / "SYNC_INFO.txt"
        if info.exists():
            for line in info.read_text(encoding="utf-8").splitlines():
                if line.startswith("synced_at:"):
                    try:
                        synced_at = datetime.fromisoformat(line.split(":", 1)[1].strip().replace("Z", "+00:00"))
                    except ValueError:
                        synced_at = None
                elif line.startswith("agents_git:"):
                    label = "agents@" + line.split(":", 1)[1].strip()
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            row = conn.execute(
                """INSERT INTO tutor.kb_versions (label, embeddings_sha, kg_sha, entity_count, synced_at)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (embeddings_sha, kg_sha) DO UPDATE SET label = COALESCE(EXCLUDED.label, tutor.kb_versions.label)
                   RETURNING id""",
                (label, emb_sha, kg_sha, entity_count, synced_at),
            ).fetchone()
            conn.commit()
        return int(row["id"]) if row else None

    # ---- profiles / conversations ----
    def load_profile(self, student_id: int) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            return conn.execute("SELECT * FROM tutor.learner_profiles WHERE student_id = %s", (student_id,)).fetchone()

    def load_latest_conversation(self, student_id: int) -> dict[str, Any] | None:
        """最新の会話（終了済みでも）。state_json を含む。"""
        if not self.enabled:
            return None
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            return conn.execute(
                """SELECT c.*, k.embeddings_sha, k.kg_sha FROM tutor.conversations c
                   LEFT JOIN tutor.kb_versions k ON k.id = c.kb_version_id
                   WHERE c.student_id = %s AND COALESCE(c.end_reason, '') <> 'deleted'
                   ORDER BY c.last_activity_at DESC LIMIT 1""",
                (student_id,),
            ).fetchone()

    def load_conversation(self, student_id: int, conversation_id: int) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            return conn.execute(
                """SELECT c.*, k.embeddings_sha, k.kg_sha FROM tutor.conversations c
                   LEFT JOIN tutor.kb_versions k ON k.id = c.kb_version_id
                   WHERE c.id = %s AND c.student_id = %s AND COALESCE(c.end_reason, '') <> 'deleted'""",
                (conversation_id, student_id),
            ).fetchone()

    def list_conversations(self, student_id: int, limit: int = 50) -> list[dict[str, Any]]:
        """学生の会話一覧（新しい順、削除済みと空の会話は除く）。"""
        if not self.enabled:
            return []
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            rows = conn.execute(
                """SELECT id, title, page_title, lesson_page_id, course_id, started_at, last_activity_at, ended_at, end_reason, turn_count
                   FROM tutor.conversations
                   WHERE student_id = %s AND COALESCE(end_reason, '') <> 'deleted' AND turn_count > 0
                   ORDER BY last_activity_at DESC LIMIT %s""",
                (student_id, limit),
            ).fetchall()
        return list(rows)

    def rename_conversation(self, student_id: int, conversation_id: int, title: str) -> bool:
        if not self.enabled:
            return False
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            cur = conn.execute(
                "UPDATE tutor.conversations SET title = %s WHERE id = %s AND student_id = %s",
                (title[:120], conversation_id, student_id),
            )
            conn.commit()
            return cur.rowcount > 0

    def delete_conversation(self, student_id: int, conversation_id: int) -> bool:
        """学生の一覧からは消すが、行は残す（質問収集のため）。end_reason='deleted'。"""
        if not self.enabled:
            return False
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            cur = conn.execute(
                """UPDATE tutor.conversations SET end_reason = 'deleted', ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
                   WHERE id = %s AND student_id = %s""",
                (conversation_id, student_id),
            )
            if cur.rowcount:
                conn.execute(
                    """UPDATE tutor.active_sessions SET conversation_id = NULL, updated_at = CURRENT_TIMESTAMP
                       WHERE student_id = %s AND conversation_id = %s""",
                    (student_id, conversation_id),
                )
            conn.commit()
            return cur.rowcount > 0

    def reopen_conversation(self, student_id: int, conversation_id: int) -> bool:
        if not self.enabled:
            return False
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            cur = conn.execute(
                """UPDATE tutor.conversations SET ended_at = NULL, end_reason = NULL, last_activity_at = CURRENT_TIMESTAMP
                   WHERE id = %s AND student_id = %s""",
                (conversation_id, student_id),
            )
            conn.commit()
            return cur.rowcount > 0

    def save_preferences(self, student_id: int, *, answer_length: str | None) -> None:
        if not self.enabled:
            return
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            conn.execute(
                """INSERT INTO tutor.learner_profiles (student_id, answer_length) VALUES (%s, %s)
                   ON CONFLICT (student_id) DO UPDATE SET answer_length = EXCLUDED.answer_length, updated_at = CURRENT_TIMESTAMP""",
                (student_id, answer_length),
            )
            conn.commit()

    def load_turns(self, conversation_id: int, limit: int = 40, *, student_id: int) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            rows = conn.execute(
                """SELECT * FROM (SELECT t.id, t.seq, t.role, t.text, t.choice_id, t.turn_class, t.knowledge_mode, t.banner,
                                         t.diagnosis, t.clarify, t.viz, t.citations, t.created_at
                                  FROM tutor.turns t JOIN tutor.conversations c ON c.id = t.conversation_id
                                  WHERE t.conversation_id = %s AND c.student_id = %s
                                  ORDER BY t.seq DESC LIMIT %s) s
                   ORDER BY seq ASC""",
                (conversation_id, student_id, limit),
            ).fetchall()
        return list(rows)

    def load_recent_turns(self, student_id: int, *, days: int = 30, limit: int = 80, exclude_conversation_id: int | None = None,
                          only_conversation_id: int | None = None) -> list[dict[str, Any]]:
        """振り返り用: 期間内の会話をまたいだ発話（会話タイトル・日時つき、古い順）。"""
        if not self.enabled:
            return []
        where = ["c.student_id = %s", "COALESCE(c.end_reason,'') <> 'deleted'", "t.created_at >= CURRENT_TIMESTAMP - make_interval(days => %s)"]
        args: list[Any] = [student_id, days]
        if exclude_conversation_id is not None:
            where.append("c.id <> %s"); args.append(exclude_conversation_id)
        if only_conversation_id is not None:
            where.append("c.id = %s"); args.append(only_conversation_id)
        args.append(limit)
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            rows = conn.execute(
                f"""SELECT * FROM (
                      SELECT t.id, t.conversation_id, c.title AS conversation_title, c.page_title, t.seq, t.role, t.text, t.choice_id,
                             t.turn_class, t.focus_concept, t.understanding_level, t.knowledge_mode, t.clarify, t.created_at
                      FROM tutor.turns t JOIN tutor.conversations c ON c.id = t.conversation_id
                      WHERE {' AND '.join(where)} ORDER BY t.created_at DESC LIMIT %s) s
                    ORDER BY created_at ASC""",
                args,
            ).fetchall()
        return list(rows)

    def previous_conversation_id(self, student_id: int, current_id: int | None) -> int | None:
        """直前の会話（現在の会話を除く、発話のあるもの）。"""
        if not self.enabled:
            return None
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            row = conn.execute(
                """SELECT id FROM tutor.conversations WHERE student_id = %s AND COALESCE(end_reason,'') <> 'deleted' AND turn_count > 0
                   AND (%s::bigint IS NULL OR id <> %s) ORDER BY last_activity_at DESC LIMIT 1""",
                (student_id, current_id, current_id),
            ).fetchone()
        return int(row["id"]) if row else None

    def start_conversation(self, student_id: int, context: dict[str, Any] | None,
                           state: dict[str, Any] | None = None) -> int | None:
        if not self.enabled:
            return None
        ctx = context or {}
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            row = conn.execute(
                """INSERT INTO tutor.conversations
                     (student_id, course_id, lesson_item_id, lesson_page_id, page_title, kb_version_id, state_json)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (student_id, ctx.get("course_id"), ctx.get("lesson_item_id"), ctx.get("lesson_page_id"),
                 ctx.get("page_title"), self.kb_version_id, _jsonb(state)),
            ).fetchone()
            conn.execute(
                """INSERT INTO tutor.learner_profiles (student_id, conversation_count, last_conversation_id)
                   VALUES (%s, 1, %s)
                   ON CONFLICT (student_id) DO UPDATE SET conversation_count = tutor.learner_profiles.conversation_count + 1,
                        last_conversation_id = EXCLUDED.last_conversation_id, updated_at = CURRENT_TIMESTAMP""",
                (student_id, row["id"]),
            )
            conn.execute(
                """INSERT INTO tutor.active_sessions (student_id, conversation_id) VALUES (%s, %s)
                   ON CONFLICT (student_id) DO UPDATE
                     SET conversation_id = EXCLUDED.conversation_id, updated_at = CURRENT_TIMESTAMP""",
                (student_id, row["id"]),
            )
            conn.commit()
        return int(row["id"])

    def end_conversation(self, conversation_id: int | None, reason: str, summary: str | None = None,
                         state: dict[str, Any] | None = None) -> None:
        if not self.enabled or conversation_id is None:
            return
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            conn.execute(
                """UPDATE tutor.conversations SET ended_at = CURRENT_TIMESTAMP, end_reason = %s,
                       summary = COALESCE(%s, summary), state_json = COALESCE(%s, state_json)
                   WHERE id = %s AND ended_at IS NULL""",
                (reason, summary, _jsonb(state), conversation_id),
            )
            conn.commit()

    def touch_context(self, conversation_id: int | None, context: dict[str, Any] | None) -> None:
        """開いている教科書ページが変わったら会話の文脈を更新（最後に見ていたページを記録）。"""
        if not self.enabled or conversation_id is None or not context:
            return
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            conn.execute(
                """UPDATE tutor.conversations SET course_id = COALESCE(%s, course_id), lesson_item_id = COALESCE(%s, lesson_item_id),
                       lesson_page_id = COALESCE(%s, lesson_page_id), page_title = COALESCE(%s, page_title)
                   WHERE id = %s""",
                (context.get("course_id"), context.get("lesson_item_id"), context.get("lesson_page_id"),
                 context.get("page_title"), conversation_id),
            )
            conn.commit()

    def record_turn_pair(
        self,
        *,
        conversation_id: int | None,
        student_id: int,
        student_text: str,
        choice_id: str | None,
        turn: dict[str, Any],
        state: dict[str, Any],
        debug_state: dict[str, Any],
        lesson_page_id: int | None,
        latency_ms: int,
        llm_model: str,
    ) -> int | None:
        """学生発話＋チュータ返答を1組として保存し、会話スナップショットとプロファイルを更新する。チュータ返答の turn id を返す。"""
        if not self.enabled or conversation_id is None:
            return None
        ls = debug_state.get("learner_state") or {}
        reply = str(turn.get("reply") or "")
        idx = reply.find("## 参考（教科書）")
        reply_body = reply[:idx].rstrip() if idx >= 0 else reply
        citations = [
            {k: c.get(k) for k in ("entity_id", "section", "type", "excerpt", "rerank_score") if k in c}
            for c in (turn.get("citations") or [])
        ]
        with self._lock, self.pool.connection() as conn:  # type: ignore[union-attr]
            seq_row = conn.execute(
                "SELECT COALESCE(MAX(seq), 0) AS m FROM tutor.turns WHERE conversation_id = %s", (conversation_id,)
            ).fetchone()
            seq = int(seq_row["m"]) + 1
            conn.execute(
                """INSERT INTO tutor.turns (conversation_id, seq, role, text, choice_id, phase, focus_concept, focus_section,
                       understanding_level, goal, lesson_page_id)
                   VALUES (%s, %s, 'student', %s, %s, %s, %s, %s, %s, %s, %s)""",
                (conversation_id, seq, student_text or (choice_id or ""), choice_id, debug_state.get("phase"),
                 debug_state.get("focus_concept"), debug_state.get("focus_section"),
                 ls.get("understanding_level"), ls.get("goal"), lesson_page_id),
            )
            tutor_row = conn.execute(
                """INSERT INTO tutor.turns (conversation_id, seq, role, text, turn_class, explain_mode, phase, knowledge_mode,
                       retrieval_path, banner, focus_concept, focus_section, understanding_level, goal, lesson_page_id,
                       diagnosis, clarify, viz, citations, latency_ms, llm_model, planner_json)
                   VALUES (%s, %s, 'tutor', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                (conversation_id, seq + 1, reply_body, turn.get("turn_class") or debug_state.get("turn_class"),
                 debug_state.get("explain_mode"), debug_state.get("phase"), turn.get("knowledge_mode"),
                 turn.get("retrieval_path"), turn.get("banner") or None, debug_state.get("focus_concept"),
                 debug_state.get("focus_section"), ls.get("understanding_level"), ls.get("goal"), lesson_page_id,
                 _jsonb(turn.get("diagnosis")), _jsonb(turn.get("clarify")), _jsonb(turn.get("viz")),
                 _jsonb(citations), latency_ms, llm_model, _jsonb(turn.get("planner"))),
            ).fetchone()
            tutor_turn_id = int(tutor_row["id"]) if tutor_row else None
            auto_title = (student_text or "").strip().replace("\n", " ")[:40] or None
            conn.execute(
                """UPDATE tutor.conversations SET last_activity_at = CURRENT_TIMESTAMP, turn_count = %s, state_json = %s,
                       title = COALESCE(title, %s)
                   WHERE id = %s""",
                (seq + 1, _jsonb(state), auto_title, conversation_id),
            )
            conn.execute(
                """INSERT INTO tutor.learner_profiles (student_id, understanding_level, goal, style, known_topics, topic_level_log,
                       last_focus_concept, last_focus_section, last_lesson_page_id, last_conversation_id, turn_count)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
                   ON CONFLICT (student_id) DO UPDATE SET
                       understanding_level = EXCLUDED.understanding_level, goal = EXCLUDED.goal, style = EXCLUDED.style,
                       known_topics = EXCLUDED.known_topics, topic_level_log = EXCLUDED.topic_level_log,
                       last_focus_concept = EXCLUDED.last_focus_concept, last_focus_section = EXCLUDED.last_focus_section,
                       last_lesson_page_id = COALESCE(EXCLUDED.last_lesson_page_id, tutor.learner_profiles.last_lesson_page_id),
                       last_conversation_id = EXCLUDED.last_conversation_id,
                       turn_count = tutor.learner_profiles.turn_count + 1, updated_at = CURRENT_TIMESTAMP""",
                (student_id, ls.get("understanding_level"), ls.get("goal"), ls.get("style"),
                 _jsonb(state.get("known_topics") or []), _jsonb(state.get("topic_level_log") or {}),
                 debug_state.get("focus_concept"), debug_state.get("focus_section"), lesson_page_id, conversation_id),
            )
            conn.commit()
        return tutor_turn_id

    # ---- 提示した演習問題の記録 ----
    def load_exposures(self, student_id: int, cooldown_days: int) -> dict[int, dict[str, Any]]:
        """question_id → {last_shown_at, times, revealed, clicked}。cooldown_days<=0 なら全期間。"""
        if not self.enabled:
            return {}
        where = "student_id = %s"
        args: list[Any] = [student_id]
        if cooldown_days > 0:
            where += " AND shown_at >= CURRENT_TIMESTAMP - make_interval(days => %s)"
            args.append(cooldown_days)
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            rows = conn.execute(
                f"""SELECT question_id, MAX(shown_at) AS last_shown_at, COUNT(*) AS times,
                           BOOL_OR(revealed_at IS NOT NULL) AS revealed, BOOL_OR(clicked_at IS NOT NULL) AS clicked
                    FROM tutor.question_exposures WHERE {where} GROUP BY question_id""",
                args,
            ).fetchall()
        return {int(r["question_id"]): dict(r) for r in rows}

    def record_exposures(self, student_id: int, conversation_id: int | None, items: list[tuple[int, str]]) -> None:
        if not self.enabled or not items:
            return
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            conn.cursor().executemany(
                "INSERT INTO tutor.question_exposures (student_id, question_id, conversation_id, status_at_show) VALUES (%s, %s, %s, %s)",
                [(student_id, qid, conversation_id, st) for qid, st in items],
            )
            conn.commit()

    def mark_exposure(self, student_id: int, question_id: int, kind: str) -> bool:
        """kind: revealed / clicked。直近の提示行に時刻を入れる（無ければ提示行を作る）。"""
        if not self.enabled or kind not in ("revealed", "clicked"):
            return False
        col = f"{kind}_at"
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            cur = conn.execute(
                f"""UPDATE tutor.question_exposures SET {col} = COALESCE({col}, CURRENT_TIMESTAMP)
                    WHERE id = (SELECT id FROM tutor.question_exposures WHERE student_id = %s AND question_id = %s
                                ORDER BY shown_at DESC LIMIT 1)""",
                (student_id, question_id),
            )
            if cur.rowcount == 0:
                conn.execute(
                    f"INSERT INTO tutor.question_exposures (student_id, question_id, {col}) VALUES (%s, %s, CURRENT_TIMESTAMP)",
                    (student_id, question_id),
                )
            conn.commit()
        return True

    # ---- フィードバック / 設定 ----
    def save_feedback(self, student_id: int, turn_id: int, rating: int, comment: str | None) -> bool:
        if not self.enabled:
            return False
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            row = conn.execute(
                """INSERT INTO tutor.turn_feedback (turn_id, conversation_id, student_id, rating, comment)
                   SELECT t.id, t.conversation_id, %s, %s, %s
                   FROM tutor.turns t JOIN tutor.conversations c ON c.id = t.conversation_id
                   WHERE t.id = %s AND t.role = 'tutor' AND c.student_id = %s
                   ON CONFLICT (turn_id, student_id) DO UPDATE
                     SET rating = EXCLUDED.rating,
                         comment = COALESCE(EXCLUDED.comment, tutor.turn_feedback.comment),
                         created_at = CURRENT_TIMESTAMP
                   RETURNING id""",
                (student_id, rating, comment, turn_id, student_id),
            ).fetchone()
            conn.commit()
        return row is not None

    def get_settings(self) -> dict[str, Any]:
        if not self.enabled:
            return {}
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            rows = conn.execute("SELECT key, value, updated_by, updated_at FROM tutor.settings").fetchall()
        return {r["key"]: r["value"] for r in rows}

    def set_setting(self, key: str, value: Any, updated_by: int | None) -> None:
        if not self.enabled:
            return
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            conn.execute(
                """INSERT INTO tutor.settings (key, value, updated_by) VALUES (%s, %s, %s)
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP""",
                (key, _jsonb(value), updated_by),
            )
            conn.commit()

    # ---- 教員ビュー用の集計 ----
    def teacher_stats(self, *, days: int = 30, course_id: int | None = None) -> dict[str, Any]:
        """ページ別／学生別／概念別の集計と、つまずきの多い問題。"""
        if not self.enabled:
            return {"enabled": False}
        where = ["t.created_at >= CURRENT_TIMESTAMP - make_interval(days => %s)"]
        args: list[Any] = [days]
        if course_id is not None:
            where.append("c.course_id = %s"); args.append(course_id)
        W = " AND ".join(where)
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            by_page = conn.execute(
                f"""SELECT COALESCE(t.lesson_page_id, c.lesson_page_id) AS lesson_page_id, MAX(c.page_title) AS page_title,
                           COUNT(*) FILTER (WHERE t.role='student') AS questions, COUNT(DISTINCT c.student_id) AS students,
                           COUNT(*) FILTER (WHERE t.role='tutor' AND t.turn_class='confused') AS confused
                    FROM tutor.turns t JOIN tutor.conversations c ON c.id=t.conversation_id WHERE {W}
                    GROUP BY 1 ORDER BY questions DESC LIMIT 30""", args).fetchall()
            by_student = conn.execute(
                f"""SELECT c.student_id, COUNT(*) FILTER (WHERE t.role='student') AS questions,
                           COUNT(DISTINCT c.id) AS conversations, MAX(t.created_at) AS last_at,
                           COUNT(*) FILTER (WHERE t.role='tutor' AND t.turn_class='confused') AS confused,
                           (SELECT understanding_level FROM tutor.learner_profiles p WHERE p.student_id=c.student_id) AS level,
                           (SELECT last_focus_concept FROM tutor.learner_profiles p WHERE p.student_id=c.student_id) AS last_focus
                    FROM tutor.turns t JOIN tutor.conversations c ON c.id=t.conversation_id WHERE {W}
                    GROUP BY c.student_id ORDER BY questions DESC LIMIT 200""", args).fetchall()
            by_concept = conn.execute(
                f"""SELECT t.focus_concept AS concept, COUNT(*) FILTER (WHERE t.role='student') AS questions,
                           COUNT(DISTINCT c.student_id) AS students,
                           COUNT(*) FILTER (WHERE t.role='tutor' AND t.turn_class='confused') AS confused
                    FROM tutor.turns t JOIN tutor.conversations c ON c.id=t.conversation_id
                    WHERE {W} AND COALESCE(t.focus_concept,'') <> ''
                    GROUP BY 1 ORDER BY questions DESC LIMIT 20""", args).fetchall()
            hard_questions = conn.execute(
                f"""SELECT e.question_id, COUNT(*) AS shown, COUNT(*) FILTER (WHERE e.status_at_show='wrong') AS shown_as_wrong,
                           COUNT(DISTINCT e.student_id) AS students, COUNT(*) FILTER (WHERE e.revealed_at IS NOT NULL) AS revealed
                    FROM tutor.question_exposures e WHERE e.shown_at >= CURRENT_TIMESTAMP - make_interval(days => %s)
                    GROUP BY 1 ORDER BY shown_as_wrong DESC, shown DESC LIMIT 20""", [days]).fetchall()
            weekly = conn.execute("SELECT * FROM tutor.v_weekly_quality LIMIT 12").fetchall()
            feedback_recent = conn.execute(
                """SELECT f.id, f.rating, f.comment, f.created_at, f.student_id, t.text AS answer, t.focus_concept,
                          (SELECT text FROM tutor.turns s WHERE s.conversation_id=t.conversation_id AND s.seq=t.seq-1) AS question
                   FROM tutor.turn_feedback f JOIN tutor.turns t ON t.id=f.turn_id ORDER BY f.created_at DESC LIMIT 30""").fetchall()
        def fix(rows):
            out=[]
            for r in rows:
                d=dict(r)
                for k,v in d.items():
                    if hasattr(v,"isoformat"): d[k]=v.isoformat()
                out.append(d)
            return out
        return {"enabled": True, "days": days, "by_page": fix(by_page), "by_student": fix(by_student), "by_concept": fix(by_concept),
                "hard_questions": fix(hard_questions), "weekly": fix(weekly), "feedback_recent": fix(feedback_recent)}

    # ---- teacher / admin views ----
    def list_questions(self, *, limit: int = 100, course_id: int | None = None, student_id: int | None = None,
                       since: datetime | None = None) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        where, args = ["TRUE"], []
        if course_id is not None:
            where.append("course_id = %s"); args.append(course_id)
        if student_id is not None:
            where.append("student_id = %s"); args.append(student_id)
        if since is not None:
            where.append("created_at >= %s"); args.append(since)
        args.append(limit)
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            rows = conn.execute(
                f"SELECT * FROM tutor.v_student_questions WHERE {' AND '.join(where)} ORDER BY created_at DESC LIMIT %s",
                args,
            ).fetchall()
        return list(rows)

    def stats(self) -> dict[str, Any]:
        if not self.enabled:
            return {"enabled": False}
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            r = conn.execute(
                """SELECT (SELECT COUNT(*) FROM tutor.conversations) AS conversations,
                          (SELECT COUNT(*) FROM tutor.turns WHERE role='student') AS questions,
                          (SELECT COUNT(*) FROM tutor.learner_profiles) AS students"""
            ).fetchone()
        return {"enabled": True, "kb_version_id": self.kb_version_id, **(r or {})}
