"""
進捗関連のビジネスロジック

このモジュールでは、進捗関連のビジネスルールをカプセル化したサービスクラスを定義します。
責務に応じて GoalService と ProgressService に分割しています。
"""
from typing import List, Optional, Sequence
from sqlalchemy import Row
from fastapi import HTTPException, status

from api.repositories.progress_repo import ProgressRepository
from api.models import progress_model, users_model
import api.schemas.progress as progress_schema

# 定数
GOAL_ACHIEVEMENT_POINT = 3  # 目標達成時に付与されるポイント

class GoalService:
    """目標(Goal)に関するビジネスロジックを担うサービスクラス"""

    def __init__(self, progress_repo: ProgressRepository):
        """コンストラクタ"""
        self.progress_repo = progress_repo

    async def get_goals_by_user(self, *, user_id: int) -> List[progress_model.Goals]:
        """ユーザーの目標一覧を取得します。"""
        return await self.progress_repo.list_goals_by_user_id(user_id=user_id)

    async def create_goal(self, *, user_id: int, goal_in: progress_schema.GoalCreate) -> progress_model.Goals:
        """新しい目標を作成します。"""
        created_goal = await self.progress_repo.create_goal(user_id=user_id, goal_in=goal_in)
        await self.progress_repo.db.commit()
        return created_goal

    async def update_goal(self, *, user_id: int, goal_id: int, goal_in: progress_schema.GoalUpdate) -> Optional[progress_model.Goals]:
        """目標の状態を更新します（達成／未達成）。

        目標が「未達成」から「達成」に更新された場合、ポイントを付与します。
        """
        goal = await self.progress_repo.get_goal_by_id(goal_id=goal_id)
        if not goal or goal.user_id != user_id:
            return None

        if goal.is_achieved == goal_in.is_achieved:
            return goal

        async with self.progress_repo.db.begin_nested():
            if goal_in.is_achieved and not goal.is_point_granted:
                student = await self.progress_repo.get_student_info(user_id=user_id)
                if student:
                    new_point = student.points + GOAL_ACHIEVEMENT_POINT
                    await self.progress_repo.update_user_point(user_id=user_id, new_point=new_point)
                    await self.progress_repo.grant_point_for_goal(goal=goal)
            
            updated_goal = await self.progress_repo.update_goal(goal=goal, goal_in=goal_in)

        await self.progress_repo.db.commit()
        await self.progress_repo.db.refresh(updated_goal)
        return updated_goal

    async def delete_goal(self, *, user_id: int, goal_id: int) -> bool:
        """目標を論理削除します。"""
        goal = await self.progress_repo.get_goal_by_id(goal_id=goal_id)
        if not goal or goal.user_id != user_id:
            return False
        
        await self.progress_repo.soft_delete_goal(goal=goal)
        await self.progress_repo.db.commit()
        return True

class ProgressService:
    """目標以外の進捗（ポイントランキング、ログ等）に関するビジネスロジックを担うサービスクラス"""

    def __init__(self, progress_repo: ProgressRepository):
        """コンストラクタ"""
        self.progress_repo = progress_repo

    async def get_my_points(self, *, user_id: int) -> int:
        """自分のポイント数を取得します。"""
        student = await self.progress_repo.get_student_info(user_id=user_id)
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
        return student.points

    async def get_my_login_days(self, *, user_id: int) -> int:
        """自分のログイン日数を取得します。"""
        student = await self.progress_repo.get_student_info(user_id=user_id)
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
        return getattr(student, 'login_days', 0)

    async def add_points_to_user(self, *, user_id: int, points_to_add: int) -> int:
        """ユーザーにポイントを追加します。"""
        student = await self.progress_repo.get_student_info(user_id=user_id)
        if not student:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
        
        new_point = student.points + points_to_add
        await self.progress_repo.update_user_point(user_id=user_id, new_point=new_point)
        await self.progress_repo.db.commit()
        return new_point

    async def get_point_ranking(self) -> Sequence[Row]:
        """ポイントランキングを取得します。"""
        return await self.progress_repo.get_point_ranking()

    async def get_all_student_logs(self) -> List[users_model.Students]:
        """（管理者向け）全学生の進捗サマリーを取得します。"""
        return await self.progress_repo.list_all_students_for_logs()

    async def get_all_goal_logs(self) -> List[progress_model.Goals]:
        """（管理者向け）全ての目標履歴を取得します。"""
        return await self.progress_repo.list_all_goals_for_logs()