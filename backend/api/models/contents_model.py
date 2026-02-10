from typing import List, Optional

from sqlalchemy import DateTime, ForeignKeyConstraint, Integer, PrimaryKeyConstraint, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base


class Contents(Base):
    __tablename__ = 'contents'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='contents_created_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='contents_pkey'),
        {'comment': 'コンテンツ実体', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content_body: Mapped[str] = mapped_column(Text, nullable=False)
    format_type: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    version_notes: Mapped[Optional[str]] = mapped_column(String(255))

    created_by_user: Mapped[Optional['Users']] = relationship('Users', back_populates='contents')
    lesson_pages_raw: Mapped[List['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.raw_content_id]', back_populates='raw_content')
    lesson_pages_rendered: Mapped[List['LessonPages']] = relationship('LessonPages', foreign_keys='[LessonPages.rendered_content_id]', back_populates='rendered_content')


class Images(Base):
    __tablename__ = 'images'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='images_pkey'),
        {'comment': '画像管理', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    alt_text: Mapped[Optional[str]] = mapped_column(String(255))
    original_name: Mapped[Optional[str]] = mapped_column(String(255))
