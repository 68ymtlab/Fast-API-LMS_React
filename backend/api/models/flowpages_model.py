from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, Double, Enum, ForeignKeyConstraint, Identity, JSON, PrimaryKeyConstraint, SmallInteger, String, Table, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class Flowpages(Base):
    __tablename__ = 'flowpages'
    __table_args__ = (
        ForeignKeyConstraint(['created_by_user_id'], ['public.users.id'], name='flowpages_created_by_user_id_fkey'),
        ForeignKeyConstraint(['parent_flowpage_id'], ['public.flowpages.id'], name='flowpages_parent_flowpage_id_fkey'),
        ForeignKeyConstraint(['raw_body_content_id'], ['public.contents.id'], name='flowpages_raw_body_content_id_fkey'),
        ForeignKeyConstraint(['rendered_body_content_id'], ['public.contents.id'], name='flowpages_rendered_body_content_id_fkey'),
        ForeignKeyConstraint(['updated_by_user_id'], ['public.users.id'], name='flowpages_updated_by_user_id_fkey'),
        PrimaryKeyConstraint('id', name='flowpages_pkey'),
        {'comment': '演習問題', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    page_type: Mapped[str] = mapped_column(Enum('single_text_question', 'multiple_text_question', 'choice_question', 'descriptive_question', name='page_type'))
    title: Mapped[str] = mapped_column(String)
    raw_body_content_id: Mapped[int] = mapped_column(BigInteger)
    rendered_body_content_id: Mapped[int] = mapped_column(BigInteger)
    difficulty_score: Mapped[float] = mapped_column(Double(53))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text('true'))
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=text('now()'))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime)
    parent_flowpage_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    updated_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger)

    created_by_user: Mapped['Users'] = relationship('Users', foreign_keys=[created_by_user_id], back_populates='flowpages')
    parent_flowpage: Mapped[Optional['Flowpages']] = relationship('Flowpages', remote_side=[id], back_populates='parent_flowpage_reverse')
    parent_flowpage_reverse: Mapped[List['Flowpages']] = relationship('Flowpages', remote_side=[parent_flowpage_id], back_populates='parent_flowpage')
    raw_body_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[raw_body_content_id], back_populates='flowpages')
    rendered_body_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[rendered_body_content_id], back_populates='flowpages_')
    updated_by_user: Mapped[Optional['Users']] = relationship('Users', foreign_keys=[updated_by_user_id], back_populates='flowpages_')
    keyword: Mapped[List['FlowpageKeywordDependency']] = relationship('FlowpageKeywordDependency', secondary='public.flowpage_keywords', back_populates='flowpage')
    flowpage_blanks: Mapped[List['FlowpageBlanks']] = relationship('FlowpageBlanks', back_populates='flowpage')
    hints: Mapped[List['Hints']] = relationship('Hints', back_populates='flowpage')
    question_choices: Mapped[List['QuestionChoices']] = relationship('QuestionChoices', back_populates='flowpage')
    flowpage_set_question: Mapped[List['FlowpageSetQuestion']] = relationship('FlowpageSetQuestion', back_populates='flowpage')
    answer: Mapped[List['Answer']] = relationship('Answer', back_populates='flowpage')
    flow_session_question: Mapped[List['FlowSessionQuestion']] = relationship('FlowSessionQuestion', back_populates='flowpage')


class FlowpageBlanks(Base):
    __tablename__ = 'flowpage_blanks'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='flowpage_blanks_flowpage_id_fkey'),
        PrimaryKeyConstraint('id', name='flowpage_blanks_pkey'),
        {'comment': '解答欄', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger)
    display_order_in_flowpage: Mapped[int] = mapped_column(BigInteger, server_default=text("'1'::bigint"))
    blank_name: Mapped[Optional[str]] = mapped_column(String)

    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='flowpage_blanks')
    correct_answer: Mapped[List['CorrectAnswer']] = relationship('CorrectAnswer', back_populates='blank')
    answer: Mapped[List['Answer']] = relationship('Answer', back_populates='blank')


t_flowpage_keywords = Table(
    'flowpage_keywords', Base.metadata,
    Column('flowpage_id', BigInteger, primary_key=True, nullable=False),
    Column('keyword_id', BigInteger, primary_key=True, nullable=False),
    ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], ondelete='CASCADE', name='flowpage_keywords_flowpage_id_fkey'),
    ForeignKeyConstraint(['keyword_id'], ['public.flowpage_keyword_dependency.id'], ondelete='CASCADE', name='flowpage_keywords_keyword_id_fkey'),
    PrimaryKeyConstraint('flowpage_id', 'keyword_id', name='flowpage_keywords_pkey1'),
    schema='public',
    comment='演習問題-キーワード'
)


class Hints(Base):
    __tablename__ = 'hints'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='hints_flowpage_id_fkey'),
        ForeignKeyConstraint(['raw_hint_content_id'], ['public.contents.id'], name='hints_raw_hint_content_id_fkey'),
        ForeignKeyConstraint(['renderd_hint_content_id'], ['public.contents.id'], name='hints_renderd_hint_content_id_fkey'),
        PrimaryKeyConstraint('id', name='hints_pkey'),
        {'comment': 'ヒント', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger)
    raw_hint_content_id: Mapped[int] = mapped_column(BigInteger)
    renderd_hint_content_id: Mapped[int] = mapped_column(BigInteger)
    display_order: Mapped[int] = mapped_column(BigInteger, server_default=text("'1'::bigint"))

    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='hints')
    raw_hint_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[raw_hint_content_id], back_populates='hints')
    renderd_hint_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[renderd_hint_content_id], back_populates='hints_')


class QuestionChoices(Base):
    __tablename__ = 'question_choices'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='question_choices_flowpage_id_fkey'),
        ForeignKeyConstraint(['raw_choice_content_id'], ['public.contents.id'], name='question_choices_raw_choice_content_id_fkey'),
        ForeignKeyConstraint(['renderd_choice_content_id'], ['public.contents.id'], name='question_choices_renderd_choice_content_id_fkey'),
        PrimaryKeyConstraint('id', name='question_choices_pkey'),
        {'comment': '選択肢テーブル', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger)
    raw_choice_content_id: Mapped[int] = mapped_column(BigInteger)
    renderd_choice_content_id: Mapped[int] = mapped_column(BigInteger)
    display_order: Mapped[int] = mapped_column(BigInteger, server_default=text("'1'::bigint"))
    is_correct_option: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))

    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='question_choices')
    raw_choice_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[raw_choice_content_id], back_populates='question_choices')
    renderd_choice_content: Mapped['Contents'] = relationship('Contents', foreign_keys=[renderd_choice_content_id], back_populates='question_choices_')


class CorrectAnswer(Base):
    __tablename__ = 'correct_answer'
    __table_args__ = (
        ForeignKeyConstraint(['blank_id'], ['public.flowpage_blanks.id'], name='correct_answer_blank_id_fkey'),
        PrimaryKeyConstraint('id', name='correct_answer_pkey'),
        {'comment': '正答テーブル', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    blank_id: Mapped[int] = mapped_column(BigInteger)
    answer_value: Mapped[str] = mapped_column(String)
    value_type: Mapped[str] = mapped_column(Enum('string', 'int', 'float', name='value_type'))
    score_weight: Mapped[float] = mapped_column(Double(53), server_default=text("'1'::double precision"))

    blank: Mapped['FlowpageBlanks'] = relationship('FlowpageBlanks', back_populates='correct_answer')


class FlowpageKeywordDependency(Base):
    __tablename__ = 'flowpage_keyword_dependency'
    __table_args__ = (
        ForeignKeyConstraint(['parent_keyword_id'], ['public.flowpage_keyword_dependency.id'], name='flowpage_keyword_dependency_parent_keyword_id_fkey'),
        PrimaryKeyConstraint('id', name='flowpage_keywords_pkey'),
        UniqueConstraint('keyword_name', name='flowpage_keywords_keyword_name_key'),
        {'comment': '演習問題_キーワード', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    keyword_name: Mapped[str] = mapped_column(String)
    parent_keyword_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    description: Mapped[Optional[str]] = mapped_column(Text)

    parent_keyword: Mapped[Optional['FlowpageKeywordDependency']] = relationship('FlowpageKeywordDependency', remote_side=[id], back_populates='parent_keyword_reverse')
    parent_keyword_reverse: Mapped[List['FlowpageKeywordDependency']] = relationship('FlowpageKeywordDependency', remote_side=[parent_keyword_id], back_populates='parent_keyword')
    learning_recommendations: Mapped[List['LearningRecommendations']] = relationship('LearningRecommendations', back_populates='reason_keyword')
    student_competencies: Mapped[List['StudentCompetencies']] = relationship('StudentCompetencies', back_populates='keyword')
    flowpage: Mapped[List['Flowpages']] = relationship('Flowpages', secondary='public.flowpage_keywords', back_populates='keyword')
    

class FlowpageSets(Base):
    __tablename__ = 'flowpage_sets'
    __table_args__ = (
        ForeignKeyConstraint(['lesson_item_id'], ['public.lesson_items.id'], name='flowpage_sets_lesson_item_id_fkey'),
        PrimaryKeyConstraint('id', name='flowpage_sets_pkey'),
        {'comment': '演習セット', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    lesson_item_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    time_limit_seconds: Mapped[Optional[int]] = mapped_column(BigInteger)
    challenge_limit: Mapped[Optional[int]] = mapped_column(BigInteger)

    lesson_item: Mapped[Optional['LessonItems']] = relationship('LessonItems', back_populates='flowpage_sets')
    flow_sessions: Mapped[list['FlowSessions']] = relationship('FlowSessions', back_populates='flowpage_set')
    flowpage_set_question: Mapped[list['FlowpageSetQuestion']] = relationship('FlowpageSetQuestion', back_populates='flowpage_set')

class FlowpageSetQuestion(Base):
    __tablename__ = 'flowpage_set_question'
    __table_args__ = (
        ForeignKeyConstraint(['flowpage_id'], ['public.flowpages.id'], name='flowpage_set_question_flowpage_id_fkey'),
        ForeignKeyConstraint(['flowpage_set_id'], ['public.flowpage_sets.id'], name='flowpage_set_question_flowpage_set_id_fkey'),
        PrimaryKeyConstraint('flowpage_set_id', 'flowpage_id', name='flowpage_set_question_pkey'),
        {'comment': '演習セット-問題', 'schema': 'public'}
    )

    flowpage_set_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    flowpage_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    display_order: Mapped[int] = mapped_column(BigInteger, server_default=text("'1'::bigint"))
    points: Mapped[int] = mapped_column(BigInteger, server_default=text("'1'::bigint"))

    flowpage: Mapped['Flowpages'] = relationship('Flowpages', back_populates='flowpage_set_question')
    flowpage_set: Mapped['FlowpageSets'] = relationship('FlowpageSets', back_populates='flowpage_set_question')
