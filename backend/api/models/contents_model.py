from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Double, Enum, ForeignKeyConstraint, Identity, JSON, PrimaryKeyConstraint, SmallInteger, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class Contents(Base):
    __tablename__ = 'contents'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='CASCADE', name='created_by_user_id'),
        PrimaryKeyConstraint('id', name='contents_pkey'),
        {'comment': 'コンテンツ実態', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True, comment='コンテンツID')
    content_body: Mapped[str] = mapped_column(Text)
    format_type: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text("(now() AT TIME ZONE 'jst'::text)"))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text("(now() AT TIME ZONE 'jst'::text)"))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger)
    version_notes: Mapped[Optional[str]] = mapped_column(String)

    created_by_user: Mapped['Users'] = relationship('Users', back_populates='contents')
    flowpages: Mapped[List['Flowpages']] = relationship('Flowpages', foreign_keys='[Flowpages.raw_body_content_id]', back_populates='raw_body_content')
    flowpages_: Mapped[List['Flowpages']] = relationship('Flowpages', foreign_keys='[Flowpages.rendered_body_content_id]', back_populates='rendered_body_content')
    hints: Mapped[List['Hints']] = relationship('Hints', foreign_keys='[Hints.raw_hint_content_id]', back_populates='raw_hint_content')
    hints_: Mapped[List['Hints']] = relationship('Hints', foreign_keys='[Hints.renderd_hint_content_id]', back_populates='renderd_hint_content')
    question_choices: Mapped[List['QuestionChoices']] = relationship('QuestionChoices', foreign_keys='[QuestionChoices.raw_choice_content_id]', back_populates='raw_choice_content')
    question_choices_: Mapped[List['QuestionChoices']] = relationship('QuestionChoices', foreign_keys='[QuestionChoices.renderd_choice_content_id]', back_populates='renderd_choice_content')
    lesson_pages: Mapped[List['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.raw_content_id]', back_populates='raw_content')
    lesson_pages_: Mapped[List['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.rendered_content_id]', back_populates='rendered_content')

class Images(Base):
    __tablename__ = 'images'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='images_pkey'),
        {'comment': '画像情報テーブル', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    original_file_name: Mapped[str] = mapped_column(String) # Renamed from file_name
    stored_file_path: Mapped[str] = mapped_column(String) # Added this line
    mime_type: Mapped[str] = mapped_column(String)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger)
    uploaded_by_user_id: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True))
    alt_text: Mapped[Optional[str]] = mapped_column(String)
    lesson_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))