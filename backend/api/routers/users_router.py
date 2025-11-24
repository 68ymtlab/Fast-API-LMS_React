"""
ユーザー関連API

このモジュールでは、ユーザー認証、ユーザー情報の取得・更新など、
ユーザーに関連するAPIエンドポイントを定義します。
"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from api.db.session import get_db
from api.core.security import get_current_active_user, require_admin, require_teacher_or_higher
from api.core.config import settings
from api.repositories.users_repo import UserRepository
from api.services.users_service import UserService
import api.schemas.users as user_schema
import api.models.users_model as user_model
from api.core.security import TokenManager

users_router = APIRouter(tags=["ユーザー管理"])

#
# Dependency Injection
#
def get_user_repo(db: AsyncSession = Depends(get_db)) -> UserRepository:
    """ユーザーリポジトリの依存性注入"""
    return UserRepository(db)

def get_user_service(repo: UserRepository = Depends(get_user_repo)) -> UserService:
    """ユーザーサービスの依存性注入"""
    return UserService(repo)

#
# Authentication Endpoints
#

@users_router.post("/token", response_model=user_schema.Token, summary="Swagger UI用トークン取得")
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    service: UserService = Depends(get_user_service)
):
    """Swagger UIでのテスト用に、ユーザー名とパスワードでアクセストークンを取得します。"""
    _user, access_token, _refresh_token = await service.perform_login(
        email=form_data.username, 
        password=form_data.password
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer"
    }

@users_router.post("/login", response_model=user_schema.LoginResponse, summary="NextAuth用 ログイン認証")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), service: UserService = Depends(get_user_service)):
    try:
        user, access_token, refresh_token = await service.perform_login(
            email=form_data.username,
            password=form_data.password
        )
    except HTTPException:
        # 認証失敗
        raise

    return {
        "user": user,
        "access_token": access_token,
        "refresh_token": refresh_token
    }

@users_router.post("/refresh", response_model=user_schema.RefreshTokenResponse, summary="トークンリフレッシュ")
async def refresh_token(
    refresh_request: user_schema.RefreshTokenRequest,
    service: UserService = Depends(get_user_service)
):
    """リフレッシュトークンを使用して新しいアクセストークンとリフレッシュトークンを取得します。"""
    try:
        # リフレッシュトークンを検証してデコード
        payload = TokenManager.decode_token(refresh_request.refresh_token)
        token_data = user_schema.TokenData(**payload)
        
        # ユーザー情報を取得
        user = await service.get_user_by_email(email=token_data.email)
        
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # 新しいトークンペイロードを生成
        token_payload = {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "display_name": user.display_name,
            "role_id": user.role_id,
            "theme_settings": user.theme_settings,
        }
        
        # 新しいトークンを生成
        new_access_token = TokenManager.create_access_token(token_payload)
        new_refresh_token = TokenManager.create_refresh_token(token_payload)
        
        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

#
# User Management Endpoints
#

@users_router.get("/users/me", response_model=user_schema.User, summary="ログインユーザー自身の情報取得")
async def read_users_me(current_user: user_model.Users = Depends(get_current_active_user)):
    """現在認証されているユーザーの情報を取得します。"""
    return current_user

@users_router.put("/users/me/password", status_code=status.HTTP_204_NO_CONTENT, summary="ログインユーザー自身のパスワード変更")
async def update_password_me(
    password_in: user_schema.PasswordUpdate,
    current_user: user_model.Users = Depends(get_current_active_user),
    service: UserService = Depends(get_user_service)
):
    """現在認証されているユーザーが、自身のパスワードを変更します。"""
    success = await service.update_own_password(user=current_user, password_in=password_in)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect current password")
    return

@users_router.post("/users", response_model=user_schema.User, status_code=status.HTTP_201_CREATED, summary="ユーザーの新規登録（教師・管理者向け）")
async def create_user(
    user_in: user_schema.UserCreate,
    current_user: user_model.Users = Depends(require_teacher_or_higher),
    service: UserService = Depends(get_user_service)
):
    """（教師・管理者権限）新しいユーザーを作成します。教師は作成できる役割に制限があります。"""
    try:
        return await service.create_user(user_in=user_in, current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

#
# Admin Endpoints
#

@users_router.post("/admin/users/password-reset", status_code=status.HTTP_204_NO_CONTENT, summary="ユーザーのパスワードリセット（管理者向け）", dependencies=[Depends(require_admin)])
async def reset_password_by_admin(
    password_in: user_schema.AdminPasswordReset,
    service: UserService = Depends(get_user_service)
):
    """（管理者権限）指定したユーザーのパスワードをリセットします。"""
    success = await service.reset_password_by_admin(password_in=password_in)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return

@users_router.get("/admin/users", response_model=List[user_schema.User], summary="ユーザー一覧取得（管理者向け）", dependencies=[Depends(require_admin)])
async def get_all_users(
    service: UserService = Depends(get_user_service),
    include_roles_mask: Optional[str] = Query(None, description="含めるユーザーの役割をバイナリマスクで指定 (例: '1010' = 管理者とテスト)")
):
    """（管理者権限）全ユーザーの一覧を取得します。"""
    return await service.get_all_users(include_roles_mask=include_roles_mask)

@users_router.get("/admin/users/{user_id}", response_model=user_schema.UserWithStudent, summary="ユーザー情報取得（ID指定, 教師以上）", dependencies=[Depends(require_teacher_or_higher)])
async def get_user_by_id(user_id: int, service: UserService = Depends(get_user_service)):
    """（教師以上の権限）IDで指定したユーザーの情報を取得します。学生情報も含まれます。"""
    user = await service.get_user_by_id(user_id=user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
