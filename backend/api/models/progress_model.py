from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKeyConstraint, Identity, PrimaryKeyConstraint, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
import datetime

from api.db.session import Base

class Goals(Base):
  __tablename__ = 'goals'
  __table_args__ = (
      ForeignKeyConstraint(['user_id'], ['public.users.id'], name='goals_user_id_fkey'),
      PrimaryKeyConstraint('id', name='goals_pkey'),
      {'comment': '目標', 'schema': 'public'}
  )

  id: Mapped[int] = mapped_column(BigInteger, Identity(start=1, increment=1, minvalue=1, maxvalue=9223372036854775807, cycle=False, cache=1), primary_key=True)
  user_id: Mapped[int] = mapped_column(BigInteger)
  content: Mapped[str] = mapped_column(Text)
  created_at: Mapped[datetime.datetime] = mapped_column(DateTime)
  is_achieved: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
  is_point_granted: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))
  achieved_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime)
  is_disabled: Mapped[bool] = mapped_column(Boolean, server_default=text('false'))

  user: Mapped['Users'] = relationship('Users', back_populates='goals')