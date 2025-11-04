from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Double, Enum, ForeignKeyConstraint, Identity, JSON, PrimaryKeyConstraint, SmallInteger, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class Subjects(Base):
  __tablename__ = 'subjects'
  __table_args__ = (
    ForeignKeyConstraint(['semester_id'], ['public.semesters.id'], ondelete='CASCADE', name='semester_id'),
    ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], ondelete='CASCADE', name='updated_by_user_id'),
    PrimaryKeyConstraint('id', name='subjects_pkey'),
    {'comment': '科目基本情報', 'schema': 'public'}
  )

  id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
  subject_name: Mapped[str] = mapped_column(String)
  academic_year: Mapped[int] = mapped_column(SmallInteger)
  semester_id: Mapped[int] = mapped_column(BigInteger)
  is_active: Mapped[bool] = mapped_column(Boolean, server_default=text('true'))
  created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text('now()'))
  updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True))
  updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)
  deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

  semester: Mapped['Semesters'] = relationship('Semesters', back_populates='subjects')
  updated_by_user: Mapped[Optional['Users']] = relationship('Users', back_populates='subjects')
  courses: Mapped[List['Courses']] = relationship('Courses', back_populates='subject')


class SubjectSyllabuses(Base):
  __tablename__ = 'subject_syllabuses'
  __table_args__ = (
    ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='subject_syllabuses_created_by_user_id_fkey'),
    ForeignKeyConstraint(['subject_category_id'], ['public.subject_categories.id'], name='subject_syllabuses_subject_category_id_fkey'),
    ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], name='subject_syllabuses_updated_by_user_id_fkey'),
    PrimaryKeyConstraint('subject_id', name='subject_syllabuses_pkey'),
    {'comment': '科目シラバス', 'schema': 'public'}
  )

  subject_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
  subject_category_id: Mapped[int] = mapped_column(BigInteger)
  credits: Mapped[int] = mapped_column(BigInteger)
  code: Mapped[str] = mapped_column(String)
  keywords: Mapped[dict] = mapped_column(JSON, server_default=text('\'{"keyword":""}\'::json'))
  learning_goal: Mapped[str] = mapped_column(Text)
  summary: Mapped[str] = mapped_column(Text)
  prerequisites: Mapped[str] = mapped_column(Text)
  behavioral_objectives: Mapped[dict] = mapped_column(JSON)
  achievement_targets: Mapped[dict] = mapped_column(JSON)
  created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text('now()'))
  created_by_user_id: Mapped[int] = mapped_column(BigInteger)
  updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True))
  updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)

  created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='subject_syllabuses')
  subject_category: Mapped['SubjectCategories'] = relationship('SubjectCategories', back_populates='subject_syllabuses')
  updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='subject_syllabuses_')


class Semesters(Base):
  __tablename__ = 'semesters'
  __table_args__ = (
    PrimaryKeyConstraint('id', name='semesters_pkey'),
    {'comment': '学期マスタ', 'schema': 'public'}
  )

  id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
  name: Mapped[str] = mapped_column(String)
  created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text('now()'))
  updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True))
  sort_order: Mapped[Optional[int]] = mapped_column(BigInteger)

  subjects: Mapped[List['Subjects']] = relationship('Subjects', back_populates='semester')


class SubjectCategories(Base):
  __tablename__ = 'subject_categories'
  __table_args__ = (
    PrimaryKeyConstraint('id', name='subject_categories_pkey'),
    {'comment': '授業科目区分マスタ', 'schema': 'public'}
  )

  id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
  name: Mapped[str] = mapped_column(String)
  created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), server_default=text("(now() AT TIME ZONE 'utc'::text)"))
  updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True))
  description: Mapped[Optional[str]] = mapped_column(Text)

  subject_syllabuses: Mapped[List['SubjectSyllabuses']] = relationship('SubjectSyllabuses', back_populates='subject_category')