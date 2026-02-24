"""
コンテンツ関連のデータベース操作

このモジュールでは、コンテンツ(Contents)や画像(Images)に関連する
データベースへのCRUD操作を担うリポジトリを定義します。
"""
from typing import List, Optional
from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload

from api.repositories.base import BaseRepository
from api.models import contents_model
import api.schemas.contents as contents_schema

class ContentRepository(BaseRepository):
    """コンテンツ関連のデータ操作をまとめたリポジトリクラス"""

    async def create_content(self, *, content_in: contents_schema.ContentCreate, created_by_user_id: int) -> contents_model.Contents:
        """新しいコンテンツを作成します。"""
        db_obj = contents_model.Contents(
            **content_in.model_dump(),
            created_by_user_id=created_by_user_id
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_content_by_id(self, *, content_id: int) -> Optional[contents_model.Contents]:
        """IDでコンテンツを一件取得します。"""
        stmt = select(contents_model.Contents).where(contents_model.Contents.id == content_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_content(self, *, content: contents_model.Contents, content_in: contents_schema.ContentCreate) -> contents_model.Contents:
        """コンテンツを更新します。"""
        update_data = content_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(content, field, value)
        content.updated_at = func.now()
        self.db.add(content)
        await self.db.flush()
        await self.db.refresh(content)
        return content

    async def delete_content(self, *, content: contents_model.Contents) -> bool:
        """コンテンツを削除します。"""
        await self.db.delete(content)
        return True

    #
    # Image Methods
    #

    async def create_image(self, *, image_in: contents_schema.ImageCreate) -> contents_model.Images:
        """新しい画像情報を登録します。"""
        db_obj = contents_model.Images(
            **image_in.model_dump()
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_image_by_id(self, *, image_id: int) -> Optional[contents_model.Images]:
        """IDで画像情報を一件取得します。"""
        stmt = select(contents_model.Images).where(contents_model.Images.id == image_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def exists_image_with_original_name(self, *, original_name: str) -> bool:
        """指定した original_name を持つ画像が既に存在するか（ファイル名は大文字小文字を区別しない）。"""
        if not original_name or not original_name.strip():
            return False
        name_lower = original_name.strip().lower()
        stmt = select(contents_model.Images.id).where(
            contents_model.Images.original_name.isnot(None),
            func.lower(contents_model.Images.original_name) == name_lower,
        ).limit(1)
        return (await self.db.execute(stmt)).scalar_one_or_none() is not None

    async def get_image_by_original_name(
        self, *, original_name: str
    ) -> Optional[contents_model.Images]:
        """original_name で画像を1件取得します（大文字小文字を区別しない）。"""
        if not original_name or not original_name.strip():
            return None
        name_lower = original_name.strip().lower()
        stmt = (
            select(contents_model.Images)
            .where(
                contents_model.Images.original_name.isnot(None),
                func.lower(contents_model.Images.original_name) == name_lower,
            )
            .limit(1)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_images(
        self, *, limit: int = 100, offset: int = 0
    ) -> List[contents_model.Images]:
        """画像一覧を取得します（新しい順）。"""
        stmt = (
            select(contents_model.Images)
            .order_by(contents_model.Images.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def delete_image(self, *, image: contents_model.Images) -> bool:
        """画像情報を削除します。"""
        await self.db.delete(image)
        return True
