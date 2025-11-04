from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Double, Enum, ForeignKeyConstraint, Identity, JSON, PrimaryKeyConstraint, SmallInteger, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class LearningRecommendations(Base):
    __tablename__ = 'learning_recommendations'
    __table_args__ = (
        ForeignKeyConstraint(['reason_keyword_id'], ['public.flowpage_keyword_dependency.id'], name='learning_recommendations_reason_keyword_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='learning_recommendations_user_id_fkey'),
        PrimaryKeyConstraint('id', name='learning_recommendations_pkey'),
        {'comment': '学習推薦', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger)
    reason_keyword_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=text('now()'))
    recommended_item_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    recommended_item_type: Mapped[Optional[str]] = mapped_column(String)

    reason_keyword: Mapped['FlowpageKeywordDependency'] = relationship('FlowpageKeywordDependency', back_populates='learning_recommendations')
    user: Mapped['Users'] = relationship('Users', back_populates='learning_recommendations')


class StudentCompetencies(Base):
    __tablename__ = 'student_competencies'
    __table_args__ = (
        ForeignKeyConstraint(['keyword_id'], ['public.flowpage_keyword_dependency.id'], name='student_competencies_keyword_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='student_competencies_user_id_fkey'),
        PrimaryKeyConstraint('user_id', 'keyword_id', name='student_competencies_pkey'),
        {'comment': '学生習熟度', 'schema': 'public'}
    )

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    keyword_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    mastery_level: Mapped[float] = mapped_column(Double(53))
    last_assessed_at: Mapped[datetime.datetime] = mapped_column(DateTime)
    confidence_level: Mapped[float] = mapped_column(Double(53))

    keyword: Mapped['FlowpageKeywordDependency'] = relationship('FlowpageKeywordDependency', back_populates='student_competencies')
    user: Mapped['Users'] = relationship('Users', back_populates='student_competencies')

