"""AI チューターのエラー（種類を表す code つき）。フロントエンドが「メンテナンス中」などを出し分けられるようにする。

code の種類:
  llm_unavailable  学内の AI サーバー（LLM）に繋がらない・応答しない、または手動のメンテナンス中（HTTP 503）
  tutor_unavailable  tutor サービス自体に繋がらない（HTTP 502）
  starting         tutor サービスが起動中で、まだ使えない（HTTP 503）
  overloaded       tutor が混み合っている（HTTP 503）
  busy             同じ学生の前の質問に回答中（HTTP 429）
  timeout          tutor の応答がタイムアウトした（HTTP 504）
フロントエンドは、llm_unavailable / tutor_unavailable / starting を「メンテナンス中（しばらくお待ちください）」として扱う。
"""
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

MAINTENANCE_MESSAGE = "AIチューターは現在メンテナンス中です。しばらくしてからもう一度お試しください。"
STARTING_MESSAGE = "AIチューターを起動しています。しばらくお待ちください。"


class TutorServiceError(HTTPException):
    """HTTPException に、種類を表す code と補足を持たせたもの。"""

    def __init__(self, status_code: int, detail: str, code: str, extra: Optional[dict[str, Any]] = None, headers: Optional[dict[str, str]] = None):
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code
        self.extra = extra or {}


def register_tutor_error_handler(app: FastAPI) -> None:
    @app.exception_handler(TutorServiceError)
    async def _handler(_request: Request, exc: TutorServiceError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "code": exc.code, **exc.extra},
            headers=exc.headers,
        )
