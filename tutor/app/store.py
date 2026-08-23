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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool
except ImportError:  # pragma: no cover
    psycopg = None  # type: ignore[assignment]
    ConnectionPool = None  # type: ignore[assignment,misc]

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
      summary TEXT, state_json JSONB)""",
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
    "CREATE INDEX IF NOT EXISTS ix_tutor_turns_created ON tutor.turns (created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_tutor_turns_role_created ON tutor.turns (role, created_at DESC)",
    """CREATE TABLE IF NOT EXISTS tutor.learner_profiles (
      student_id INTEGER PRIMARY KEY, understanding_level TEXT, goal TEXT, style TEXT,
      known_topics JSONB NOT NULL DEFAULT '[]'::jsonb, topic_level_log JSONB NOT NULL DEFAULT '{}'::jsonb,
      last_focus_concept TEXT, last_focus_section TEXT, last_lesson_page_id INTEGER, last_conversation_id BIGINT,
      conversation_count INTEGER NOT NULL DEFAULT 0, turn_count INTEGER NOT NULL DEFAULT 0,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)""",
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
        self.kb_version_id: int | None = None
        self._lock = threading.Lock()

    # ---- lifecycle ----
    def connect(self, stage4_dir: str | None, entity_count: int | None) -> None:
        if not self.enabled:
            print("  [store] TUTOR_DATABASE_URL 未設定 → 永続化オフ（メモリのみ）", flush=True)
            return
        last_exc: Exception | None = None
        for attempt in range(1, 11):  # db コンテナの起動待ち（最大 ~30 秒）
            try:
                self.pool = ConnectionPool(self.dsn, min_size=1, max_size=4, kwargs={"row_factory": dict_row}, open=True)
                with self.pool.connection() as conn:
                    for stmt in DDL:
                        conn.execute(stmt)
                    conn.commit()
                last_exc = None
                break
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                print(f"  [store] DB 接続待ち ({attempt}/10): {exc}", flush=True)
                if self.pool is not None:
                    self.pool.close()
                    self.pool = None
                time.sleep(3)
        if last_exc is not None:
            raise RuntimeError(f"tutor スキーマに接続できません: {last_exc}") from last_exc
        self.kb_version_id = self._register_kb_version(stage4_dir, entity_count)
        print(f"  [store] 永続化オン（kb_version_id={self.kb_version_id}）", flush=True)

    def close(self) -> None:
        if self.pool is not None:
            self.pool.close()

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
                   WHERE c.student_id = %s ORDER BY c.last_activity_at DESC LIMIT 1""",
                (student_id,),
            ).fetchone()

    def load_turns(self, conversation_id: int, limit: int = 40) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            rows = conn.execute(
                """SELECT * FROM (SELECT id, seq, role, text, choice_id, turn_class, knowledge_mode, banner,
                                         diagnosis, clarify, viz, citations, created_at
                                  FROM tutor.turns WHERE conversation_id = %s ORDER BY seq DESC LIMIT %s) s
                   ORDER BY seq ASC""",
                (conversation_id, limit),
            ).fetchall()
        return list(rows)

    def start_conversation(self, student_id: int, context: dict[str, Any] | None) -> int | None:
        if not self.enabled:
            return None
        ctx = context or {}
        with self.pool.connection() as conn:  # type: ignore[union-attr]
            row = conn.execute(
                """INSERT INTO tutor.conversations (student_id, course_id, lesson_item_id, lesson_page_id, page_title, kb_version_id)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
                (student_id, ctx.get("course_id"), ctx.get("lesson_item_id"), ctx.get("lesson_page_id"),
                 ctx.get("page_title"), self.kb_version_id),
            ).fetchone()
            conn.execute(
                """INSERT INTO tutor.learner_profiles (student_id, conversation_count, last_conversation_id)
                   VALUES (%s, 1, %s)
                   ON CONFLICT (student_id) DO UPDATE SET conversation_count = tutor.learner_profiles.conversation_count + 1,
                        last_conversation_id = EXCLUDED.last_conversation_id, updated_at = CURRENT_TIMESTAMP""",
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
    ) -> None:
        """学生発話＋チュータ返答を1組として保存し、会話スナップショットとプロファイルを更新する。"""
        if not self.enabled or conversation_id is None:
            return
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
            conn.execute(
                """INSERT INTO tutor.turns (conversation_id, seq, role, text, turn_class, explain_mode, phase, knowledge_mode,
                       retrieval_path, banner, focus_concept, focus_section, understanding_level, goal, lesson_page_id,
                       diagnosis, clarify, viz, citations, latency_ms, llm_model)
                   VALUES (%s, %s, 'tutor', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (conversation_id, seq + 1, reply_body, turn.get("turn_class") or debug_state.get("turn_class"),
                 debug_state.get("explain_mode"), debug_state.get("phase"), turn.get("knowledge_mode"),
                 turn.get("retrieval_path"), turn.get("banner") or None, debug_state.get("focus_concept"),
                 debug_state.get("focus_section"), ls.get("understanding_level"), ls.get("goal"), lesson_page_id,
                 _jsonb(turn.get("diagnosis")), _jsonb(turn.get("clarify")), _jsonb(turn.get("viz")),
                 _jsonb(citations), latency_ms, llm_model),
            )
            conn.execute(
                """UPDATE tutor.conversations SET last_activity_at = CURRENT_TIMESTAMP, turn_count = %s, state_json = %s
                   WHERE id = %s""",
                (seq + 1, _jsonb(state), conversation_id),
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
