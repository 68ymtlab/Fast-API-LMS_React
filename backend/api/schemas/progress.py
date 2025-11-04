"""
進捗（目標・ポイント）関連のスキーマ定義

このモジュールでは、ユーザーの目標設定、達成、およびそれに伴うポイントの管理に関連する
Pydanticスキーマを定義します。
"""
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional

#
# Goal Schemas (目標関連)
#

class GoalBase(BaseModel):
    """目標情報の基本スキーマ"""
    content: Optional[str] = Field(None, description="目標の内容", max_length=500)

class GoalCreate(BaseModel):
    """目標作成時の入力スキーマ"""
    content: str = Field(..., description="目標の内容", max_length=500)

class GoalUpdate(BaseModel):
    """目標更新時の入力スキーマ"""
    is_achieved: bool = Field(..., description="目標の達成状況")

class GoalInDBBase(GoalBase):
    """データベース内の目標情報の基本スキーマ"""
    id: int = Field(..., description="目標ID")
    user_id: int = Field(..., description="ユーザーID")
    content: str = Field(..., description="目標の内容")
    is_achieved: bool = Field(..., description="目標達成済みか")
    is_point_granted: bool = Field(..., description="ポイントが付与済みか")
    achieved_at: Optional[datetime] = Field(None, description="目標達成日時")
    created_at: datetime = Field(..., description="目標設定日時")
    is_disabled: bool = Field(False, description="無効フラグ")

    model_config = ConfigDict(from_attributes=True)

class Goal(GoalInDBBase):
    """クライアントに返す目標情報のスキーマ"""
    pass

class GoalRecord(Goal):
    """目標の全履歴情報（管理者向け）"""
    pass

#
# Point Schemas (ポイント関連)
#

class PointRanking(BaseModel):
    """ポイントランキングのユーザースキーマ"""
    student_id: str = Field(..., description="学籍番号")
    point: int = Field(..., description="ポイント")

    model_config = ConfigDict(from_attributes=True)

class PointAdd(BaseModel):
    """ポイント追加時の入力スキーマ"""
    points: int = Field(..., description="追加するポイント数")

#
# User Progress Schemas (ユーザー進捗関連)
#

class UserProgressSummary(BaseModel):
    """学生個人の進捗サマリー情報"""
    user_id: int = Field(..., description="ユーザーID")
    grade: str = Field(..., description="学年")
    department: str = Field(..., description="学科")
    class_number: str = Field(..., description="クラス番号")
    point: int = Field(..., description="現在ポイント")
    login_days: int = Field(..., description="ログイン日数")

    model_config = ConfigDict(from_attributes=True)
