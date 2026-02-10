from typing import Optional

from sqlalchemy import DateTime, ForeignKeyConstraint, Numeric, PrimaryKeyConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base


class StudentCompetencies(Base):
    __tablename__ = 'student_competencies'
    __table_args__ = (
        ForeignKeyConstraint(['subject_id'], ['public.subjects.id'], ondelete='CASCADE', name='student_competencies_subject_id_fkey'),
        ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE', name='student_competencies_user_id_fkey'),
        PrimaryKeyConstraint('user_id', 'subject_id', name='student_competencies_pkey'),
        {'comment': '学生習熟度', 'schema': 'public'}
    )

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mastery_level: Mapped[Optional[float]] = mapped_column(Numeric(5, 4))
    last_assessed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))

    user: Mapped['Users'] = relationship('Users', back_populates='student_competencies')
    subject: Mapped['Subjects'] = relationship('Subjects', back_populates='student_competencies')
