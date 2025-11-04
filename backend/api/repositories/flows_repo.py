"""
フロー（演習問題）関連のデータベース操作

このモジュールでは、演習問題（Flowpage）、キーワード、演習セットなどに関連する
データベースへのCRUD操作を担うリポジトリを定義します。
"""
from typing import List, Optional
from api.models import flowpages_model
from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload

from api.repositories.base import BaseRepository
from api.models import contents_model
import api.schemas.flows as flows_schema

#
# Flowpage Keyword Repository
#

class FlowpageKeywordRepository(BaseRepository):
    """演習問題キーワードのデータ操作をまとめたリポジトリクラス"""

    async def create_keyword(self, *, keyword_in: flows_schema.FlowpageKeywordDependencyCreate) -> flowpages_model.FlowpageKeywordDependency:
        """新しいキーワードを作成します。"""
        db_obj = flowpages_model.FlowpageKeywordDependency(
            **keyword_in.model_dump()
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_keyword_by_name(self, *, keyword_name: str) -> Optional[flowpages_model.FlowpageKeywordDependency]:
        """キーワード名でキーワードを一件取得します。"""
        stmt = select(flowpages_model.FlowpageKeywordDependency).where(flowpages_model.FlowpageKeywordDependency.keyword_name == keyword_name)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def get_keyword_by_id(self, *, keyword_id: int) -> Optional[flowpages_model.FlowpageKeywordDependency]:
        """IDでキーワードを一件取得します。"""
        stmt = select(flowpages_model.FlowpageKeywordDependency).where(flowpages_model.FlowpageKeywordDependency.id == keyword_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

#
# Flowpage Sets Repository
#

class FlowpageSetsRepository(BaseRepository):
    """演習セットのデータ操作をまとめたリポジトリクラス"""

    async def create_flowpage_set(self, *, flowpage_set_in: flows_schema.FlowpageSetsCreate) -> flowpages_model.FlowpageSets:
        """新しい演習セットを作成します。"""
        db_obj = flowpages_model.FlowpageSets(
            **flowpage_set_in.model_dump()
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_flowpage_set_by_id(self, *, flowpage_set_id: int) -> Optional[flowpages_model.FlowpageSets]:
        """IDで演習セットを一件取得します。"""
        stmt = select(flowpages_model.FlowpageSets).where(flowpages_model.FlowpageSets.id == flowpage_set_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_flowpage_set(self, *, flowpage_set: flowpages_model.FlowpageSets, flowpage_set_in: flows_schema.FlowpageSetsCreate) -> flowpages_model.FlowpageSets:
        """演習セットを更新します。"""
        update_data = flowpage_set_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(flowpage_set, field, value)
        self.db.add(flowpage_set)
        await self.db.flush()
        await self.db.refresh(flowpage_set)
        return flowpage_set

    async def delete_flowpage_set(self, *, flowpage_set: flowpages_model.FlowpageSets) -> bool:
        """演習セットを削除します。"""
        await self.db.delete(flowpage_set)
        return True

#
# Flowpage Repository
#

class FlowpageRepository(BaseRepository):
    """演習問題ページ（Flowpage）のデータ操作をまとめたリポジトリクラス"""

    async def create_flowpage(self, *, flowpage_in: flows_schema.FlowpageCreate, created_by_user_id: int) -> flowpages_model.Flowpages:
        """新しい演習問題ページを作成します。"""
        db_obj = flowpages_model.Flowpages(
            **flowpage_in.model_dump(exclude={"keywords"}), # keywordsは別途処理
            created_by_user_id=created_by_user_id
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_flowpage_by_id(self, *, flowpage_id: int) -> Optional[flowpages_model.Flowpages]:
        """IDで演習問題ページを一件取得します。"""
        stmt = select(flowpages_model.Flowpages).where(flowpages_model.Flowpages.id == flowpage_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_flowpage(self, *, flowpage: flowpages_model.Flowpages, flowpage_in: flows_schema.FlowpageCreate) -> flowpages_model.Flowpages:
        """演習問題ページを更新します。"""
        update_data = flowpage_in.model_dump(exclude_unset=True, exclude={"keywords"})
        for field, value in update_data.items():
            setattr(flowpage, field, value)
        self.db.add(flowpage)
        await self.db.flush()
        await self.db.refresh(flowpage)
        return flowpage

    async def soft_delete_flowpage(self, *, flowpage: flowpages_model.Flowpages) -> flowpages_model.Flowpages:
        """演習問題ページを論理削除します。"""
        flowpage.is_active = False
        self.db.add(flowpage)
        await self.db.flush()
        await self.db.refresh(flowpage)
        return flowpage

    async def add_keywords_to_flowpage(self, *, flowpage: flowpages_model.Flowpages, keyword_ids: List[int]):
        """Flowpageにキーワードを関連付けます。"""
        # 既存の関連をクリアしてから追加
        flowpage.keyword.clear()
        for keyword_id in keyword_ids:
            keyword = await self.db.get(flowpages_model.FlowpageKeywordDependency, keyword_id)
            if keyword:
                flowpage.keyword.append(keyword)
        self.db.add(flowpage)
        await self.db.flush()

    async def get_flowpage_keywords(self, *, flowpage_id: int) -> List[flowpages_model.FlowpageKeywordDependency]:
        """Flowpageに関連付けられたキーワードを取得します。"""
        stmt = select(flowpages_model.FlowpageKeywordDependency).join(flowpages_model.Flowpages.keyword).where(flowpages_model.Flowpages.id == flowpage_id)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    #
    # Blank Methods
    #

    async def create_blank(self, *, blank_in: flows_schema.BlankCreate) -> flowpages_model.FlowpageBlanks:
        """新しい解答欄を作成します。"""
        db_obj = flowpages_model.FlowpageBlanks(
            **blank_in.model_dump()
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    #
    # Correct Answer Methods
    #

    async def create_correct_answer(self, *, correct_answer_in: flows_schema.CorrectAnswerCreate) -> flowpages_model.CorrectAnswer:
        """新しい正答を作成します。"""
        db_obj = flowpages_model.CorrectAnswer(
            **correct_answer_in.model_dump()
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    #
    # Choice Methods
    #

    async def create_choice(self, *, choice_in: flows_schema.ChoiceCreate) -> flowpages_model.QuestionChoices:
        """新しい選択肢を作成します。"""
        db_obj = flowpages_model.QuestionChoices(
            **choice_in.model_dump()
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj
