from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Integer, PrimaryKeyConstraint, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db.session import Base
import datetime


class Questions(Base):
    __tablename__ = 'questions'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='questions_pkey'),
        {'comment': '問題本体', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    question_type: Mapped[str] = mapped_column(String(50), nullable=False)
    difficulty: Mapped[Optional[int]] = mapped_column(Integer)
    content_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))

    tags: Mapped[List['Tags']] = relationship('Tags', secondary='question_tags', back_populates='questions')
    student_answers: Mapped[List['StudentAnswers']] = relationship('StudentAnswers', back_populates='question')


class Tags(Base):
    __tablename__ = 'tags'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='tags_pkey'),
        {'comment': 'タグマスタ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    slug: Mapped[Optional[str]] = mapped_column(String(50))

    questions: Mapped[List['Questions']] = relationship('Questions', secondary='question_tags', back_populates='tags')


class QuestionTags(Base):
    __tablename__ = 'question_tags'
    __table_args__ = (
        ForeignKeyConstraint(['question_id'], ['public.questions.id'], ondelete='CASCADE', name='question_tags_question_id_fkey'),
        ForeignKeyConstraint(['tag_id'], ['public.tags.id'], ondelete='CASCADE', name='question_tags_tag_id_fkey'),
        PrimaryKeyConstraint('question_id', 'tag_id', name='question_tags_pkey'),
        {'comment': '問題-タグ中間テーブル', 'schema': 'public'}
    )

    question_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tag_id: Mapped[int] = mapped_column(Integer, primary_key=True)
