from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Integer, PrimaryKeyConstraint, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base


class Subjects(Base):
    __tablename__ = 'subjects'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='subjects_created_by_user_id_fkey'),
        ForeignKeyConstraint(['semester_id'], ['public.semesters.id'], ondelete='RESTRICT', name='subjects_semester_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='subjects_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='subjects_pkey'),
        {'comment': '科目基本情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject_name: Mapped[str] = mapped_column(String(255), nullable=False)
    academic_year: Mapped[Optional[int]] = mapped_column(Integer)
    semester_id: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    deleted_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    semester: Mapped['Semesters'] = relationship('Semesters', back_populates='subjects')
    created_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='subjects')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='subjects_')
    courses: Mapped[List['Courses']] = relationship('Courses', back_populates='subject')
    subject_syllabus: Mapped[Optional['SubjectSyllabuses']] = relationship('SubjectSyllabuses', back_populates='subject')
    student_competencies: Mapped[List['StudentCompetencies']] = relationship('StudentCompetencies', back_populates='subject')


class SubjectSyllabuses(Base):
    __tablename__ = 'subject_syllabuses'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='subject_syllabuses_created_by_user_id_fkey'),
        ForeignKeyConstraint(['subject_category_id'], ['public.subject_categories.id'], ondelete='RESTRICT', name='subject_syllabuses_subject_category_id_fkey'),
        ForeignKeyConstraint(['subject_id'], ['public.subjects.id'], ondelete='CASCADE', name='subject_syllabuses_subject_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], ondelete='SET NULL', name='subject_syllabuses_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('subject_id', name='subject_syllabuses_pkey'),
        {'comment': '科目シラバス', 'schema': 'public'}
    )

    subject_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_category_id: Mapped[int] = mapped_column(Integer, nullable=False)
    credits: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    keywords: Mapped[Optional[dict]] = mapped_column(JSONB)
    learning_goal: Mapped[Optional[str]] = mapped_column(Text)
    summary: Mapped[Optional[str]] = mapped_column(Text)
    prerequisites: Mapped[Optional[str]] = mapped_column(Text)
    behavioral_objectives: Mapped[Optional[dict]] = mapped_column(JSONB)
    achievement_targets: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    created_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(Integer)

    created_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='subject_syllabuses')
    subject_category: Mapped['SubjectCategories'] = relationship('SubjectCategories', back_populates='subject_syllabuses')
    subject: Mapped['Subjects'] = relationship('Subjects', back_populates='subject_syllabus')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='subject_syllabuses_')


class Semesters(Base):
    __tablename__ = 'semesters'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='semesters_pkey'),
        {'comment': '学期マスタ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))

    subjects: Mapped[List['Subjects']] = relationship('Subjects', back_populates='semester')


class SubjectCategories(Base):
    __tablename__ = 'subject_categories'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='subject_categories_pkey'),
        {'comment': '授業科目区分マスタ', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('CURRENT_TIMESTAMP'))

    subject_syllabuses: Mapped[List['SubjectSyllabuses']] = relationship('SubjectSyllabuses', back_populates='subject_category')
