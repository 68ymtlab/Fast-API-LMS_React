"""
ユーザー関連API

このモジュールでは、ユーザー認証、ユーザー情報の取得・更新など、
ユーザーに関連するAPIエンドポイントを定義します。
"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Response, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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

        # 後方互換: token payload は email / sub / id のいずれかでユーザー特定を許容
        token_email = token_data.email or token_data.sub
        user = None
        if token_email:
            user = await service.get_user_by_email(email=token_email)
        elif token_data.id is not None:
            user = await service.get_user_by_id(user_id=token_data.id)
        
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

@users_router.post("/add_access_history", status_code=status.HTTP_201_CREATED, summary="アクセス・滞在時間ログの記録")
async def add_access_history(
    history_in: user_schema.AccessHistoryCreate,
    current_user: user_model.Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """(任意のログインユーザー) ページへのアクセス・滞在時間履歴を保存します。"""
    from datetime import datetime
    try:
        access_date = datetime.strptime(history_in.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD")

    db_obj = user_model.AccessHistories(
        user_id=current_user.id,
        access_date=access_date,
        page=history_in.page,
        time=history_in.time,
        details=history_in.details,
    )
    db.add(db_obj)
    await db.commit()
    return {"message": "Success"}

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


@users_router.post(
    "/users/bulk",
    response_model=user_schema.UserBulkCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="ユーザーの一括登録（教師・管理者向け）",
)
async def create_users_bulk(
    users_in: List[user_schema.UserCreate],
    current_user: user_model.Users = Depends(require_teacher_or_higher),
    service: UserService = Depends(get_user_service),
):
    """（教師・管理者権限）複数ユーザーを一括作成します。失敗した行はスキップして処理を継続します。"""
    return await service.create_users_bulk(users_in=users_in, current_user=current_user)


@users_router.get(
    "/users/students",
    response_model=List[user_schema.StudentUserOption],
    summary="学生ユーザー一覧取得（教師・管理者向け）",
)
async def list_student_users(
    current_user: user_model.Users = Depends(require_teacher_or_higher),
    service: UserService = Depends(get_user_service),
):
    """履修登録用に学生ユーザー一覧を返します。"""
    _ = current_user
    users = await service.get_student_users()
    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "email": u.email,
            "grade": u.student.grade if u.student else None,
            "department": u.student.department if u.student else None,
            "student_number": u.student.student_number if u.student else None,
            "class_number": u.student.class_number if u.student else None,
            "class_roster_number": u.student.class_roster_number if u.student else None,
        }
        for u in users
    ]


class TeacherUserOption(BaseModel):
    """権限管理UI向けの教師ユーザー簡易情報"""
    id: int
    username: Optional[str] = None
    display_name: Optional[str] = None
    email: str

    model_config = ConfigDict(from_attributes=True)


@users_router.get(
    "/users/teachers",
    summary="教師ユーザー一覧取得（教師・管理者向け）",
)
async def list_teacher_users(
    current_user: user_model.Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    """コース権限管理用に教師ユーザー一覧を返します（自分自身は除外）。"""
    from sqlalchemy import select
    from api.models import users_model as um
    # role_id=2 が教師
    stmt = select(um.Users).where(
        um.Users.role_id == 2,
        um.Users.id != current_user.id,
        um.Users.is_disabled == False,
        um.Users.deleted_at == None,
    )
    result = await db.execute(stmt)
    teachers = result.scalars().all()
    return [
        {
            "id": t.id,
            "username": t.username,
            "display_name": t.display_name,
            "email": t.email,
        }
        for t in teachers
    ]

#
# Admin Endpoints
#

@users_router.post("/admin/users/password-reset", status_code=status.HTTP_204_NO_CONTENT, summary="ユーザーのパスワードリセット（管理者向け）")
async def reset_password_by_admin(
    password_in: user_schema.AdminPasswordReset,
    current_user: user_model.Users = Depends(require_admin),
    service: UserService = Depends(get_user_service)
):
    """（管理者権限）指定したユーザーのパスワードをリセットします。"""
    success = await service.reset_password_by_admin(admin_user=current_user, password_in=password_in)
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


@users_router.put(
    "/admin/users/{user_id}",
    response_model=user_schema.User,
    summary="ユーザー情報更新（管理者向け）",
)
async def update_user_by_admin(
    user_id: int,
    user_in: user_schema.AdminUserUpdate,
    current_user: user_model.Users = Depends(require_admin),
    service: UserService = Depends(get_user_service),
):
    """（管理者権限）管理者パスワード確認のうえ、指定ユーザーの情報を更新します。"""
    updated_user = await service.update_user_by_admin(
        admin_user=current_user,
        user_id=user_id,
        user_in=user_in,
    )
    if not updated_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return updated_user


@users_router.delete(
    "/admin/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="ユーザー削除（管理者向け・管理者パスワード確認）",
)
async def delete_user_by_admin(
    user_id: int,
    delete_in: user_schema.AdminPasswordConfirm,
    current_user: user_model.Users = Depends(require_admin),
    service: UserService = Depends(get_user_service),
):
    """（管理者権限）管理者パスワード確認のうえ、指定ユーザーを論理削除します。"""
    success = await service.delete_user_by_admin(
        admin_user=current_user,
        user_id=user_id,
        delete_in=delete_in,
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return


@users_router.get(
    "/admin/access-histories",
    response_model=List[user_schema.AdminAccessHistoryResponse],
    summary="アクセス履歴一覧取得（管理者向け）",
    dependencies=[Depends(require_admin)],
)
async def list_access_histories_for_admin(
    limit: int = Query(200, ge=1, le=1000, description="取得件数の上限"),
    user_id: Optional[int] = Query(None, description="ユーザーIDで絞り込み"),
    page: Optional[str] = Query(None, description="ページ名（部分一致）で絞り込み"),
    db: AsyncSession = Depends(get_db),
):
    """（管理者向け）アクセス履歴を新しい順に取得します。"""
    stmt = (
        select(user_model.AccessHistories, user_model.Users)
        .join(user_model.Users, user_model.AccessHistories.user_id == user_model.Users.id)
        .order_by(user_model.AccessHistories.created_at.desc())
        .limit(limit)
    )

    if user_id is not None:
        stmt = stmt.where(user_model.AccessHistories.user_id == user_id)
    if page:
        stmt = stmt.where(user_model.AccessHistories.page.ilike(f"%{page.strip()}%"))

    rows = (await db.execute(stmt)).all()

    return [
        {
            "id": access.id,
            "user_id": access.user_id,
            "username": user.username,
            "display_name": user.display_name,
            "email": user.email,
            "role_id": user.role_id,
            "access_date": access.access_date,
            "page": access.page,
            "time": access.time,
            "details": access.details,
            "created_at": access.created_at,
        }
        for access, user in rows
    ]
