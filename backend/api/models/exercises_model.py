from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Integer, Numeric, PrimaryKeyConstraint, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base


class ExerciseSets(Base):
    __tablename__ = 'exercise_sets'
    __table_args__ = (
        ForeignKeyConstraint(['course_id'], ['public.courses.id'], ondelete='CASCADE', name='exercise_sets_course_id_fkey'),
        PrimaryKeyConstraint('id', name='exercise_sets_pkey'),
        {'comment': '演習セット/テスト', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    course_id: Mapped[int] = mapped_column(Integer, nullable=False)
    question_ids: Mapped[dict] = mapped_column(JSONB, nullable=False)

    course: Mapped['Courses'] = relationship('Courses', back_populates='exercise_sets')
    exercise_sessions: Mapped[List['ExerciseSessions']] = relationship('ExerciseSessions', back_populates='exercise_set')


class ExerciseSessions(Base):
    __tablename__ = 'exercise_sessions'
    __table_args__ = (
        ForeignKeyConstraint(['exercise_set_id'], ['public.exercise_sets.id'], ondelete='CASCADE', name='exercise_sessions_exercise_set_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE', name='exercise_sessions_user_id_fkey'),
        PrimaryKeyConstraint('id', name='exercise_sessions_pkey'),
        {'comment': '挑戦履歴/セッション', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    exercise_set_id: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[Optional[float]] = mapped_column(Numeric(5, 2))
    started_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False)
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    user: Mapped['Users'] = relationship('Users', back_populates='exercise_sessions')
    exercise_set: Mapped['ExerciseSets'] = relationship('ExerciseSets', back_populates='exercise_sessions')
    student_answers: Mapped[List['StudentAnswers']] = relationship('StudentAnswers', back_populates='session')


class StudentAnswers(Base):
    __tablename__ = 'student_answers'
    __table_args__ = (
        ForeignKeyConstraint(['question_id'], ['public.questions.id'], ondelete='CASCADE', name='student_answers_question_id_fkey'),
        ForeignKeyConstraint(['session_id'], ['public.exercise_sessions.id'], ondelete='CASCADE', name='student_answers_session_id_fkey'),
        PrimaryKeyConstraint('id', name='student_answers_pkey'),
        {'comment': '解答詳細ログ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, nullable=False)
    question_id: Mapped[int] = mapped_column(Integer, nullable=False)
    answer_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean)

    session: Mapped['ExerciseSessions'] = relationship('ExerciseSessions', back_populates='student_answers')
    question: Mapped['Questions'] = relationship('Questions', back_populates='student_answers')
