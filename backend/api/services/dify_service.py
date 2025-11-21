"""
Dify API連携サービス
"""
import httpx
from api.core.config import settings
from api.schemas.dify import QuestionGenerationInputs, QuestionGenerationResponse


class DifyService:
    """Dify APIとの連携を行うサービスクラス"""
    
    def __init__(self):
        self.api_url = settings.DIFY_API_URL
        self.api_key = settings.DIFY_QUESTION_GEN_API_KEY
    
    async def upload_file(self, file_content: bytes, filename: str, user: str = "default-user") -> str:
        """
        Dify APIにファイルをアップロードする
        
        Args:
            file_content: ファイルの内容（バイト列）
            filename: ファイル名
            user: ユーザー識別子
            
        Returns:
            str: アップロードされたファイルのID
        """
        import mimetypes
        
        # ファイルのMIMEタイプを推測
        mime_type, _ = mimetypes.guess_type(filename)
        if not mime_type:
            mime_type = "application/octet-stream"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}"
        }
        
        # multipart/form-dataとしてファイルを送信
        files = {
            "file": (filename, file_content, mime_type)
        }
        
        data = {
            "user": user
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.api_url}/files/upload",
                headers=headers,
                files=files,
                data=data
            )
            response.raise_for_status()
            
            result = response.json()
            
            # Difyのレスポンスから直接IDを取得
            file_id = result.get("id")
            if not file_id:
                raise ValueError(f"File upload response missing 'id': {result}")
            
            return file_id
        
    async def generate_question(
        self, 
        inputs: QuestionGenerationInputs,
        response_mode: str = "blocking",
        user: str = "default-user"
    ) -> QuestionGenerationResponse:
        """
        Dify APIを使用して問題を生成する
        
        Args:
            inputs: Difyワークフローへの入力パラメータ（QuestionGenerationInputs）
            response_mode: レスポンスモード (blocking or streaming)
            user: ユーザー識別子
            
        Returns:
            QuestionGenerationResponse: 生成結果
        """
        if not self.api_key:
            return QuestionGenerationResponse(
                status="error",
                error="DIFY_QUESTION_GEN_API_KEY is not configured"
            )
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "inputs": inputs.model_dump(),
            "response_mode": response_mode,
            "user": user
        }
        
        # デバッグ: ペイロードをログ出力
        import json
        print(f"[Dify Workflow] Sending payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.api_url}/workflows/run",
                    headers=headers,
                    json=payload
                )
                response.raise_for_status()
                
                result = response.json()
                
                # デバッグ: レスポンスをログ出力
                print(f"[Dify Workflow] Response: {json.dumps(result, indent=2, ensure_ascii=False)}")
                
                return QuestionGenerationResponse(
                    workflow_run_id=result.get("workflow_run_id"),
                    task_id=result.get("task_id"),
                    data=result.get("data"),
                    status="success"
                )
                
        except httpx.HTTPStatusError as e:
            error_detail = f"HTTP {e.response.status_code}: {e.response.text}"
            return QuestionGenerationResponse(
                status="error",
                error=error_detail
            )
        except httpx.RequestError as e:
            return QuestionGenerationResponse(
                status="error",
                error=f"Request failed: {str(e)}"
            )
        except Exception as e:
            return QuestionGenerationResponse(
                status="error",
                error=f"Unexpected error: {str(e)}"
            )
