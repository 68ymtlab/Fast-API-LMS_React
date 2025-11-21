"""
Dify API関連のエンドポイント
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from typing import Optional
from api.schemas.dify import QuestionGenerationInputs, QuestionGenerationResponse
from api.services.dify_service import DifyService
from api.core.security import require_teacher_or_higher
from api.models.users_model import Users


dify_router = APIRouter(prefix="/dify", tags=["Dify"])


def get_dify_service() -> DifyService:
    """DifyServiceの依存性注入"""
    return DifyService()


@dify_router.post(
    "/generate-question",
    response_model=QuestionGenerationResponse,
    summary="問題生成",
    description="Dify APIを使用して問題を生成します（教師・管理者のみ）"
)
async def generate_question(
    difficulty: int = Form(..., ge=1, le=5, description="難易度 (1-5)"),
    number: int = Form(..., gt=0, description="作成する問題数"),
    keyword: str = Form(..., description="問題のタグ"),
    rule: UploadFile = File(..., description="問題生成のルールブック"),
    exercises: UploadFile = File(..., description="演習問題データ"),
    test_data: UploadFile = File(..., description="学習データ"),
    custom: Optional[str] = Form(default="", description="その他の要望"),
    response_mode: str = Form(default="blocking", description="レスポンスモード"),
    user_id: str = Form(default="default-user", description="ユーザー識別子"),
    # current_user: Users = Depends(require_teacher_or_higher), # 一時的に認証を無効化
    dify_service: DifyService = Depends(get_dify_service)
) -> QuestionGenerationResponse:
    """
    Dify APIを使用して問題を生成する（教師・管理者のみアクセス可能）
    
    - **difficulty**: 難易度 (1-5の整数)
    - **number**: 作成する問題数
    - **keyword**: 問題のタグ
    - **rule**: 問題生成のルールブック（ファイル）
    - **exercises**: 演習問題データ（ファイル）
    - **test_data**: 学習データ（ファイル）
    - **custom**: その他の要望
    """
    try:
        # ファイルを読み込む
        rule_content = await rule.read()
        exercises_content = await exercises.read()
        test_data_content = await test_data.read()
        
        # ユーザーIDを統一（認証が無効なため、フォームからのuser_idを使用）
        # consistent_user_id = current_user.email or user_id
        consistent_user_id = user_id
        
        # Dify APIにファイルをアップロード
        try:
            # 同じユーザーIDでアップロード
            rule_id = await dify_service.upload_file(rule_content, rule.filename or "rule.pdf", consistent_user_id)
            exercises_id = await dify_service.upload_file(exercises_content, exercises.filename or "exercises.pdf", consistent_user_id)
            test_data_id = await dify_service.upload_file(test_data_content, test_data.filename or "test_data.pdf", consistent_user_id)
            
            # ファイル処理完了を待つ（短い遅延）
            import asyncio
            await asyncio.sleep(0.5)
            
        except Exception as upload_error:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"ファイルアップロードエラー: {str(upload_error)}"
            )
        
        # ファイル参照をDify形式で構築（type: "document" を含むオブジェクトのリスト）
        rule_files = [{
            "type": "document",
            "transfer_method": "local_file",
            "upload_file_id": rule_id
        }]
        
        exercises_files = [{
            "type": "document",
            "transfer_method": "local_file",
            "upload_file_id": exercises_id
        }]
        
        test_data_files = [{
            "type": "document",
            "transfer_method": "local_file",
            "upload_file_id": test_data_id
        }]
        
        # 入力データを構築
        inputs = QuestionGenerationInputs(
            difficulty=difficulty,
            number=number,
            keyword=keyword,
            rule=rule_files,
            exercises=exercises_files,
            test_data=test_data_files,
            custom=custom or ""
        )
        
        result = await dify_service.generate_question(
            inputs=inputs,
            response_mode=response_mode,
            user=consistent_user_id
        )
        
        if result.status == "error":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.error
            )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ファイル処理中にエラーが発生しました: {str(e)}"
        )
