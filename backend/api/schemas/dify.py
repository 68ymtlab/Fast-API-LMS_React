"""
Dify API関連のスキーマ定義
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Dict, Any, List


class QuestionGenerationInputs(BaseModel):
    """問題生成の入力パラメータ"""
    difficulty: int = Field(
        ...,
        ge=1,
        le=5,
        description="難易度 (1-5の整数)"
    )
    number: int = Field(
        ...,
        gt=0,
        description="作成する問題数"
    )
    keyword: str = Field(
        ...,
        description="問題のタグ"
    )
    rule: List[Dict[str, str]] = Field(
        ...,
        description="問題生成のルールブック（Difyファイルオブジェクトのリスト）"
    )
    exercises: List[Dict[str, str]] = Field(
        ...,
        description="演習問題データ（Difyファイルオブジェクトのリスト）"
    )
    test_data: List[Dict[str, str]] = Field(
        ...,
        description="学習データ（Difyファイルオブジェクトのリスト）"
    )
    custom: Optional[str] = Field(
        default="",
        description="その他の要望"
    )


class QuestionGenerationRequest(BaseModel):
    """問題生成リクエスト"""
    inputs: QuestionGenerationInputs = Field(
        ..., 
        description="Difyワークフローへの入力パラメータ"
    )
    response_mode: str = Field(
        default="blocking",
        description="レスポンスモード (blocking or streaming)"
    )
    user: str = Field(
        default="default-user",
        description="ユーザー識別子"
    )


class QuestionGenerationResponse(BaseModel):
    """問題生成レスポンス"""
    workflow_run_id: Optional[str] = Field(None, description="ワークフロー実行ID")
    task_id: Optional[str] = Field(None, description="タスクID")
    data: Optional[Dict[str, Any]] = Field(None, description="生成された問題データ")
    status: str = Field(default="success", description="実行ステータス")
    error: Optional[str] = Field(None, description="エラーメッセージ")
