from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Double, Enum, ForeignKeyConstraint, Identity, JSON, PrimaryKeyConstraint, SmallInteger, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class FlowSessions(Base):
    __tablename__ = 'flow_sessions'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_set_id'], ['public.flowpage_sets.id'], name='flow_sessions_flowpage_set_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='flow_sessions_user_id_fkey'),
        PrimaryKeyConstraint('id', name='flow_sessions_pkey'),
        {'comment': '演習セッション情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String)
    attempt_number: Mapped[int] = mapped_column(BigInteger, server_default=text("'1'::bigint"))
    started_ayt: Mapped[datetime.datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=text('now()'))
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime)
    flowpage_set_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    grade: Mapped[Optional[float]] = mapped_column(Double(53))
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)

    flowpage_set: Mapped[Optional['FlowpageSets']] = relationship('FlowpageSets', back_populates='flow_sessions')
    user: Mapped['Users'] = relationship('Users', back_populates='flow_sessions')
    answer: Mapped[List['Answer']] = relationship('Answer', back_populates='flow_session')
    flow_session_question: Mapped[List['FlowSessionQuestion']] = relationship('FlowSessionQuestion', back_populates='flow_session')
    
class FlowSessionQuestion(Base):
    __tablename__ = 'flow_session_question'
    __table_args__ = (
        ForeignKeyConstraint(['flow_session_id'], ['public.flow_sessions.id'], name='flow_session_question_flow_session_id_fkey'),
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='flow_session_question_flowpage_id_fkey'),
        PrimaryKeyConstraint('flow_session_id', 'flowpage_id', name='flow_session_question_pkey'),
        {'comment': '演習セッション出題記録', 'schema': 'public'}
    )

    flow_session_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    display_order: Mapped[int] = mapped_column(BigInteger, server_default=text("'1'::bigint"))
    is_submitted: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=text('now()'))
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean, server_default=text('false'))

    flow_session: Mapped['FlowSessions'] = relationship('FlowSessions', back_populates='flow_session_question')
    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='flow_session_question')
    
class Answer(Base):
    __tablename__ = 'answer'
    __table_args__ = (
        ForeignKeyConstraint(['blank_id'], ['public.flowpage_blanks.id'], name='answer_blank_id_fkey'),
        ForeignKeyConstraint(['flow_session_id'], ['public.flow_sessions.id'], name='answer_flow_session_id_fkey'),
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='answer_flowpage_id_fkey'),
        PrimaryKeyConstraint('id', name='answer_pkey'),
        {'comment': '学生解答情報', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    flow_session_id: Mapped[int] = mapped_column(BigInteger)
    flowpage_id: Mapped[int] = mapped_column(BigInteger)
    blank_id: Mapped[int] = mapped_column(BigInteger)
    submitted_answer: Mapped[str] = mapped_column(Text)
    attempt_number: Mapped[int] = mapped_column(BigInteger, server_default=text("'1'::bigint"))
    submitted_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=text('now()'))
    is_correct: Mapped[Optional[bool]] = mapped_column(Boolean)
    points_awarded: Mapped[Optional[float]] = mapped_column(Double(53))
    evaluated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)
    evaluator_feedback: Mapped[Optional[str]] = mapped_column(Text)

    blank: Mapped['FlowpageBlanks'] = relationship('FlowpageBlanks', back_populates='answer')
    flow_session: Mapped['FlowSessions'] = relationship('FlowSessions', back_populates='answer')
    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='answer')

