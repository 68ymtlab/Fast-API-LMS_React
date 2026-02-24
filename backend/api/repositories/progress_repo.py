"""
進捗（目標・ポイント）関連のデータベース操作

このモジュールでは、目標(Goals)やユーザーの進捗(Students)に関連する
データベースへのCRUD操作（作成、読み取り、更新、削除）を担うリポジトリを定義します。
"""
from typing import Sequence, Optional, List
from sqlalchemy import select, update, desc, Row, func
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from api.repositories.base import BaseRepository
from api.models import users_model, progress_model
import api.schemas.progress as progress_schema

class ProgressRepository(BaseRepository):
    @staticmethod
    def _is_missing_goals_table(error: ProgrammingError) -> bool:
        """goals テーブル未作成時のエラーかどうかを判定する。"""
        return 'relation "public.goals" does not exist' in str(error)

    """進捗関連のデータ操作をまとめたリポジトリクラス"""

    #
    # Goal Methods (目標関連)
    #

    async def create_goal(self, *, user_id: int, goal_in: progress_schema.GoalCreate) -> progress_model.Goals:
        """新しい目標を作成します。"""
        db_obj = progress_model.Goals(user_id=user_id, content=goal_in.content)
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_goal_by_id(self, *, goal_id: int) -> Optional[progress_model.Goals]:
        """IDで目標を一件取得します。"""
        stmt = select(progress_model.Goals).where(progress_model.Goals.id == goal_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_goals_by_user_id(self, *, user_id: int) -> List[progress_model.Goals]:
        """指定されたユーザーの有効な目標を全て取得します。"""
        stmt = (
            select(progress_model.Goals)
            .where(progress_model.Goals.user_id == user_id, progress_model.Goals.is_disabled == False)
            .order_by(progress_model.Goals.created_at.desc())
        )
        try:
            return (await self.db.execute(stmt)).scalars().all()
        except ProgrammingError as e:
            # 旧DB（goals未作成）ではホーム画面遷移時に500になるため空配列を返す
            if self._is_missing_goals_table(e):
                return []
            raise

    async def update_goal(self, *, goal: progress_model.Goals, goal_in: progress_schema.GoalUpdate) -> progress_model.Goals:
        """目標情報を更新します。主に達成状況の更新に用います。"""
        update_data = goal_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(goal, field, value)
        
        # is_achieved が True に設定された場合、achieved_at を現在時刻に設定
        if goal_in.is_achieved and not goal.achieved_at:
            goal.achieved_at = func.now()

        self.db.add(goal)
        await self.db.flush()
        await self.db.refresh(goal)
        return goal

    async def grant_point_for_goal(self, *, goal: progress_model.Goals) -> progress_model.Goals:
        """目標達成によるポイントが付与済みであることを記録します。"""
        goal.is_point_granted = True
        self.db.add(goal)
        await self.db.flush()
        await self.db.refresh(goal)
        return goal

    async def soft_delete_goal(self, *, goal: progress_model.Goals) -> progress_model.Goals:
        """目標を論理削除します。"""
        goal.is_disabled = True
        self.db.add(goal)
        await self.db.flush()
        await self.db.refresh(goal)
        return goal

    #
    # Point & User Progress Methods (ポイント・進捗関連)
    #

    async def update_user_point(self, *, user_id: int, new_point: int) -> bool:
        """ユーザーのポイントを指定した値で更新します。"""
        stmt = (
            update(users_model.Students)
            .where(users_model.Students.user_id == user_id)
            .values(points=new_point)
        )
        res = await self.db.execute(stmt)
        return res.rowcount > 0

    async def get_point_ranking(self, *, limit: int = 30) -> Sequence[Row]:
        """ポイント上位のユーザーを取得します。学籍番号とポイントを返します。"""
        stmt = (
            select(
                users_model.Users.username.label("student_id"), 
                users_model.Students.points.label("point")
            )
            .join(users_model.Students, users_model.Students.user_id == users_model.Users.id)
            .order_by(desc(users_model.Students.points))
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        return res.all()

    async def get_student_info(self, *, user_id: int) -> Optional[users_model.Students]:
        """ユーザーIDで学生情報を取得します。"""
        stmt = select(users_model.Students).where(users_model.Students.user_id == user_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    #
    # Log/Admin Methods (ログ・管理者向け)
    #

    async def list_all_students_for_logs(self) -> List[users_model.Students]:
        """（ログ用）全学生の情報を取得します。"""
        stmt = select(users_model.Students).order_by(users_model.Students.user_id)
        return (await self.db.execute(stmt)).scalars().all()

    async def list_all_goals_for_logs(self) -> List[progress_model.Goals]:
        """（ログ用）全目標の履歴を取得します。"""
        stmt = select(progress_model.Goals).order_by(progress_model.Goals.id)
        try:
            return (await self.db.execute(stmt)).scalars().all()
        except ProgrammingError as e:
            if self._is_missing_goals_table(e):
                return []
            raise
