"""
進捗（目標・ポイント）関連API

このモジュールでは、目標(Goal)や進捗(Progress)に関するAPIエンドポイントを定義します。
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.db.session import get_db
from api.core.security import get_current_active_user, require_admin
from api.repositories.progress_repo import ProgressRepository
from api.services.progress_service import GoalService, ProgressService
import api.schemas.progress as progress_schema
import api.models.users_model as user_model

progress_router = APIRouter()

#
# Dependency Injection
#
def get_progress_repo(db: AsyncSession = Depends(get_db)) -> ProgressRepository:
    """進捗リポジトリの依存性注入"""
    return ProgressRepository(db)

def get_goal_service(repo: ProgressRepository = Depends(get_progress_repo)) -> GoalService:
    """目標サービスの依存性注入"""
    return GoalService(repo)

def get_progress_service(repo: ProgressRepository = Depends(get_progress_repo)) -> ProgressService:
    """進捗サービスの依存性注入"""
    return ProgressService(repo)

#
# Goal Endpoints
#

@progress_router.get("/goals", response_model=List[progress_schema.Goal], tags=["目標管理"], summary="自分の目標一覧取得")
async def list_my_goals(
    current_user: user_model.Users = Depends(get_current_active_user),
    goal_service: GoalService = Depends(get_goal_service)
):
    """ログイン中のユーザーが設定した目標の一覧を取得します。"""
    return await goal_service.get_goals_by_user(user_id=current_user.id)

@progress_router.post("/goals", response_model=progress_schema.Goal, status_code=status.HTTP_201_CREATED, tags=["目標管理"], summary="目標の新規作成")
async def create_new_goal(
    goal_in: progress_schema.GoalCreate,
    current_user: user_model.Users = Depends(get_current_active_user),
    goal_service: GoalService = Depends(get_goal_service)
):
    """新しい目標を作成します。"""
    return await goal_service.create_goal(user_id=current_user.id, goal_in=goal_in)

@progress_router.put("/goals/{goal_id}", response_model=progress_schema.Goal, tags=["目標管理"], summary="目標の達成状況更新")
async def update_goal_status(
    goal_id: int,
    goal_in: progress_schema.GoalUpdate,
    current_user: user_model.Users = Depends(get_current_active_user),
    goal_service: GoalService = Depends(get_goal_service)
):
    """指定した目標の達成状況を更新します。"""
    updated_goal = await goal_service.update_goal(user_id=current_user.id, goal_id=goal_id, goal_in=goal_in)
    if not updated_goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found or not owned by user")
    return updated_goal

@progress_router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["目標管理"], summary="目標の削除")
async def delete_a_goal(
    goal_id: int,
    current_user: user_model.Users = Depends(get_current_active_user),
    goal_service: GoalService = Depends(get_goal_service)
):
    """指定した目標を論理削除します。"""
    success = await goal_service.delete_goal(user_id=current_user.id, goal_id=goal_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found or not owned by user")
    return

#
# Progress Endpoints
#

@progress_router.get("/progress/points", response_model=int, tags=["進捗管理"], summary="自分のポイント取得")
async def get_my_points(
    current_user: user_model.Users = Depends(get_current_active_user),
    progress_service: ProgressService = Depends(get_progress_service)
):
    """ログイン中のユーザーの現在のポイント数を取得します。"""
    return await progress_service.get_my_points(user_id=current_user.id)

@progress_router.get("/progress/logindays", response_model=int, tags=["進捗管理"], summary="自分のログイン日数取得")
async def get_my_login_days(
    current_user: user_model.Users = Depends(get_current_active_user),
    progress_service: ProgressService = Depends(get_progress_service)
):
    """ログイン中のユーザーのログイン日数を取得します。"""
    return await progress_service.get_my_login_days(user_id=current_user.id)

@progress_router.post("/progress/points/add", response_model=int, tags=["進捗管理"], summary="ポイントの追加")
async def add_points(
    points_in: progress_schema.PointAdd,
    current_user: user_model.Users = Depends(get_current_active_user),
    progress_service: ProgressService = Depends(get_progress_service)
):
    """ログイン中のユーザーにポイントを追加します。"""
    return await progress_service.add_points_to_user(user_id=current_user.id, points_to_add=points_in.points)

@progress_router.get("/progress/points/ranking", response_model=List[progress_schema.PointRanking], tags=["進捗管理"], summary="ポイントランキング取得")
async def get_point_leaderboard(
    progress_service: ProgressService = Depends(get_progress_service)
):
    """ポイント獲得数の上位ランキングを取得します。"""
    ranking_rows = await progress_service.get_point_ranking()
    # Row オブジェクトを Pydantic モデルに変換
    return [progress_schema.PointRanking.model_validate(row, from_attributes=True) for row in ranking_rows]

#
# Admin Endpoints
#

@progress_router.get("/admin/progress/logs/students", response_model=List[progress_schema.UserProgressSummary], tags=["管理者"], summary="全学生の進捗ログ取得", dependencies=[Depends(require_admin)])
async def get_all_student_progress_logs(
    progress_service: ProgressService = Depends(get_progress_service)
):
    """（管理者向け）全学生の進捗サマリーログを取得します。"""
    return await progress_service.get_all_student_logs()

@progress_router.get("/admin/progress/logs/goals", response_model=List[progress_schema.GoalRecord], tags=["管理者"], summary="全目標のログ取得", dependencies=[Depends(require_admin)])
async def get_all_goal_records(
    progress_service: ProgressService = Depends(get_progress_service)
):
    """（管理者向け）全ての目標履歴を取得します。"""
    return await progress_service.get_all_goal_logs()