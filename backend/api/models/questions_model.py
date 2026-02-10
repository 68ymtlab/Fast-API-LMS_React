from typing import List, Optional

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, PrimaryKeyConstraint, String, Table, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.db.session import Base
import datetime


question_tags = Table(
    'question_tags',
    Base.metadata,
    Column('question_id', Integer, ForeignKey('public.questions.id', ondelete='CASCADE'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('public.tags.id', ondelete='CASCADE'), primary_key=True),
    schema='public',
    comment='問題-タグ中間テーブル',
)


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

    tags: Mapped[List['Tags']] = relationship('Tags', secondary=question_tags, back_populates='questions')
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

    questions: Mapped[List['Questions']] = relationship('Questions', secondary=question_tags, back_populates='tags')


class QuestionTags(Base):
    __table__ = question_tags
