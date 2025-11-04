"""
フロー（演習問題）関連のビジネスロジック

このモジュールでは、演習問題（Flowpage）、キーワード、演習セットなどに関連する
ビジネスルールをカプセル化したサービスクラスを定義します。
"""
from typing import List, Optional, Dict, Any
from api.models import flowpages_model
from fastapi import HTTPException, status

from api.repositories.flows_repo import FlowpageKeywordRepository, FlowpageSetsRepository, FlowpageRepository
from api.repositories.contents_repo import ContentRepository
from api.services.contents_service import ContentService # 追加
from api.models import contents_model, users_model
import api.schemas.flows as flows_schema
import api.schemas.contents as contents_schema

#
# Flowpage Keyword Service
#

class FlowpageKeywordService:
    """演習問題キーワードのビジネスロジックを担うサービスクラス"""

    def __init__(self, keyword_repo: FlowpageKeywordRepository):
        """コンストラクタ"""
        self.keyword_repo = keyword_repo

    async def get_or_create_keyword(self, *, keyword_name: str) -> flowpages_model.FlowpageKeywordDependency:
        """キーワード名でキーワードを取得または新規作成します。"""
        keyword = await self.keyword_repo.get_keyword_by_name(keyword_name=keyword_name)
        if keyword is None:
            keyword_in = flows_schema.FlowpageKeywordDependencyCreate(keyword_name=keyword_name)
            keyword = await self.keyword_repo.create_keyword(keyword_in=keyword_in)
            await self.keyword_repo.db.commit()
        return keyword

    async def get_keyword_by_id(self, *, keyword_id: int) -> Optional[flowpages_model.FlowpageKeywordDependency]:
        """IDでキーワードを取得します。"""
        return await self.keyword_repo.get_keyword_by_id(keyword_id=keyword_id)

#
# Flowpage Sets Service
#

class FlowpageSetsService:
    """演習セットのビジネスロジックを担うサービスクラス"""

    def __init__(self, flowpage_sets_repo: FlowpageSetsRepository):
        """コンストラクタ"""
        self.flowpage_sets_repo = flowpage_sets_repo

    async def create_flowpage_set(self, *, flowpage_set_in: flows_schema.FlowpageSetsCreate) -> flowpages_model.FlowpageSets:
        """新しい演習セットを作成します。"""
        created_set = await self.flowpage_sets_repo.create_flowpage_set(flowpage_set_in=flowpage_set_in)
        await self.flowpage_sets_repo.db.commit()
        return created_set

    async def get_flowpage_set_by_id(self, *, flowpage_set_id: int) -> Optional[flowpages_model.FlowpageSets]:
        """IDで演習セットを取得します。"""
        return await self.flowpage_sets_repo.get_flowpage_set_by_id(flowpage_set_id=flowpage_set_id)

    async def update_flowpage_set(self, *, flowpage_set_id: int, flowpage_set_in: flows_schema.FlowpageSetsCreate) -> Optional[flowpages_model.FlowpageSets]:
        """演習セットを更新します。"""
        flowpage_set = await self.flowpage_sets_repo.get_flowpage_set_by_id(flowpage_set_id=flowpage_set_id)
        if flowpage_set is None:
            return None
        updated_set = await self.flowpage_sets_repo.update_flowpage_set(flowpage_set=flowpage_set, flowpage_set_in=flowpage_set_in)
        await self.flowpage_sets_repo.db.commit()
        return updated_set

    async def delete_flowpage_set(self, *, flowpage_set_id: int) -> bool:
        """演習セットを削除します。"""
        flowpage_set = await self.flowpage_sets_repo.get_flowpage_set_by_id(flowpage_set_id=flowpage_set_id)
        if flowpage_set is None:
            return False
        success = await self.flowpage_sets_repo.delete_flowpage_set(flowpage_set=flowpage_set)
        await self.flowpage_sets_repo.db.commit()
        return success

#
# Flowpage Service
#

class FlowpageService:
    """演習問題ページ（Flowpage）のビジネスロジックを担うサービスクラス"""

    def __init__(self, flowpage_repo: FlowpageRepository, content_service: ContentService, keyword_service: FlowpageKeywordService):
        """コンストラクタ"""
        self.flowpage_repo = flowpage_repo
        self.content_service = content_service
        self.keyword_service = keyword_service

    async def create_flowpage(
        self, 
        *, 
        flowpage_in: flows_schema.FlowpageCreate, 
        created_by_user_id: int
    ) -> flowpages_model.Flowpages:
        """新しい演習問題ページを作成します。"""
        # Flowpageの作成
        db_flowpage = await self.flowpage_repo.create_flowpage(
            flowpage_in=flowpage_in, created_by_user_id=created_by_user_id
        )
        
        # キーワードの関連付け
        if flowpage_in.keywords:
            keyword_ids = []
            for keyword_name in flowpage_in.keywords:
                keyword = await self.keyword_service.get_or_create_keyword(keyword_name=keyword_name)
                keyword_ids.append(keyword.id)
            await self.flowpage_repo.add_keywords_to_flowpage(flowpage=db_flowpage, keyword_ids=keyword_ids)

        await self.flowpage_repo.db.commit()
        return db_flowpage

    async def get_flowpage_by_id(self, *, flowpage_id: int) -> Optional[flowpages_model.Flowpages]:
        """IDで演習問題ページを取得します。"""
        return await self.flowpage_repo.get_flowpage_by_id(flowpage_id=flowpage_id)

    async def update_flowpage(
        self, 
        *, 
        flowpage_id: int, 
        flowpage_in: flows_schema.FlowpageCreate, 
        updated_by_user_id: int
    ) -> Optional[flowpages_model.Flowpages]:
        """演習問題ページを更新します。"""
        flowpage = await self.flowpage_repo.get_flowpage_by_id(flowpage_id=flowpage_id)
        if flowpage is None:
            return None
        
        updated_flowpage = await self.flowpage_repo.update_flowpage(
            flowpage=flowpage, flowpage_in=flowpage_in
        )

        # キーワードの更新
        if flowpage_in.keywords:
            keyword_ids = []
            for keyword_name in flowpage_in.keywords:
                keyword = await self.keyword_service.get_or_create_keyword(keyword_name=keyword_name)
                keyword_ids.append(keyword.id)
            await self.flowpage_repo.add_keywords_to_flowpage(flowpage=updated_flowpage, keyword_ids=keyword_ids)
        else:
            # キーワードが指定されていない場合は既存の関連をクリア
            await self.flowpage_repo.add_keywords_to_flowpage(flowpage=updated_flowpage, keyword_ids=[])

        await self.flowpage_repo.db.commit()
        return updated_flowpage

    async def soft_delete_flowpage(self, *, flowpage_id: int) -> bool:
        """演習問題ページを論理削除します。"""
        flowpage = await self.flowpage_repo.get_flowpage_by_id(flowpage_id=flowpage_id)
        if flowpage is None:
            return False
        success = await self.flowpage_repo.soft_delete_flowpage(flowpage=flowpage)
        await self.flowpage_repo.db.commit()
        return success

    async def create_blank(self, *, blank_in: flows_schema.BlankCreate) -> flowpages_model.FlowpageBlanks:
        """新しい解答欄を作成します。"""
        created_blank = await self.flowpage_repo.create_blank(blank_in=blank_in)
        await self.flowpage_repo.db.commit()
        return created_blank

    async def create_correct_answer(self, *, correct_answer_in: flows_schema.CorrectAnswerCreate) -> flowpages_model.CorrectAnswer:
        """新しい正答を作成します。"""
        created_answer = await self.flowpage_repo.create_correct_answer(correct_answer_in=correct_answer_in)
        await self.flowpage_repo.db.commit()
        return created_answer

    async def create_choice(self, *, choice_in: flows_schema.ChoiceCreate) -> flowpages_model.QuestionChoices:
        """新しい選択肢を作成します。"""
        created_choice = await self.flowpage_repo.create_choice(choice_in=choice_in)
        await self.flowpage_repo.db.commit()
        return created_choice
