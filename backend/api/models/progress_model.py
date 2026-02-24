"""
進捗（目標・ポイント）関連のモデル定義

このモジュールでは、目標(Goals)に関連するSQLAlchemyモデルを定義します。
"""
from typing import Optional
import datetime

from sqlalchemy import Boolean, DateTime, ForeignKeyConstraint, Integer, PrimaryKeyConstraint, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from api.db.session import Base


class Goals(Base):
    """目標テーブル"""
    __tablename__ = 'goals'
    __table_args__ = (
        ForeignKeyConstraint(['user_id'], ['public.users.id'], name='goals_user_id_fkey'),
        PrimaryKeyConstraint('id', name='goals_pkey'),
        {'comment': '目標', 'schema': 'public'}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(True), nullable=False, server_default=text('now()'))
    is_achieved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    is_point_granted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    is_disabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    achieved_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True))
