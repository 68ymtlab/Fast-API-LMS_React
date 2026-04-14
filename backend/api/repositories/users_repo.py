from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Sequence
import uuid

from api.repositories.base import BaseRepository
import api.models.users_model as user_model
import api.schemas.users as user_schema

class UserRepository(BaseRepository):

    async def get_by_email(self, *, email: str) -> Optional[user_model.Users]:
        """メールアドレスでユーザーを一件取得します（ロール情報も同時に読み込みます）。"""
        stmt = (
            select(user_model.Users)
            .options(selectinload(user_model.Users.role))
            .where(
                user_model.Users.email == email,
                user_model.Users.deleted_at.is_(None),
            )
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_by_id(self, *, user_id: int) -> Optional[user_model.Users]:
        """IDでユーザーを一件取得します（ロールと学生情報も同時に読み込みます）。"""
        stmt = (
            select(user_model.Users)
            .options(selectinload(user_model.Users.role), selectinload(user_model.Users.student))
            .where(
                user_model.Users.id == user_id,
                user_model.Users.deleted_at.is_(None),
            )
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def create(self, *, user_in: user_schema.UserCreate, hashed_password: str) -> user_model.Users:
        """Usersテーブルに新しいユーザーを作成します。"""
        user_data = user_in.model_dump(exclude={"password", "student_info"})
        db_obj = user_model.Users(**user_data, password_hash=hashed_password)
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def create_student_details(self, *, user_id: int, student_in: user_schema.StudentCreate) -> user_model.Students:
        """Studentsテーブルに学生の詳細情報を作成します。"""
        student_data = student_in.model_dump(exclude_none=True)
        db_obj = user_model.Students(user_id=user_id, **student_data)
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def update(self, *, user: user_model.Users, user_in: user_schema.UserUpdate, hashed_password: Optional[str] = None) -> user_model.Users:
        """ユーザー情報を更新します。"""
        update_data = user_in.model_dump(exclude_unset=True, exclude={"password", "student_info"})
        
        if hashed_password:
            update_data["password_hash"] = hashed_password
        
        for field, value in update_data.items():
            setattr(user, field, value)
            
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def soft_delete(self, *, user: user_model.Users) -> user_model.Users:
        """ユーザーを論理削除します。"""
        user.is_disabled = True
        # users.email は UNIQUE 制約のため、論理削除時に退避メールへ置き換えて再利用可能にする
        user.email = f"deleted+{user.id}+{uuid.uuid4().hex}@example.invalid"
        user.deleted_at = func.now()
        user.updated_at = func.now()
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def touch_last_login(self, *, user_id: int) -> None:
        """最終ログイン日時を現在時刻で更新します。"""
        stmt = update(user_model.Users).where(user_model.Users.id == user_id).values(last_login_at=func.now())
        await self.db.execute(stmt)

    async def list_all(self, *, include_roles_mask: Optional[str] = None) -> Sequence[user_model.Users]:
        """全ユーザーのリストを取得します。"""
        stmt = (
            select(user_model.Users)
            .options(selectinload(user_model.Users.role))
            .where(user_model.Users.deleted_at.is_(None))
            .order_by(user_model.Users.id)
        )

        # ロールIDのマッピング: 0:管理者, 1:教師, 2:学生, 3:テスト
        ROLE_ID_MAP = {0: 1, 1: 2, 2: 3, 3: 4}

        if include_roles_mask:
            allowed_roles = []
            for i, char in enumerate(include_roles_mask):
                if char == '1' and i in ROLE_ID_MAP:
                    allowed_roles.append(ROLE_ID_MAP[i])
            
            if allowed_roles:
                stmt = stmt.where(user_model.Users.role_id.in_(allowed_roles))
            else:
                # マスクが指定されたが、有効なロールが一つも含まれない場合、空のリストを返す
                return []

        res = await self.db.execute(stmt)
        return res.scalars().all()

    async def list_students(self) -> Sequence[user_model.Users]:
        """学生ユーザー一覧を取得します（students 関連を含む）。"""
        stmt = (
            select(user_model.Users)
            .options(selectinload(user_model.Users.student))
            .where(
                user_model.Users.role_id == 3,
                user_model.Users.deleted_at.is_(None),
            )
            .order_by(user_model.Users.id)
        )
        res = await self.db.execute(stmt)
        return res.scalars().all()
