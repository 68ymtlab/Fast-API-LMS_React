"""
レッスン関連のデータベース操作

このモジュールでは、レッスン(CourseLessons)に関連する
データベースへのCRUD操作を担うリポジトリを定義します。
"""
from typing import List, Optional
from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload, noload

from api.repositories.base import BaseRepository
from api.repositories.contents_repo import ContentRepository

from api.models import lessons_model
import api.schemas.lessons as lessons_schema
from api.models.flowpages_model import Flowpages, FlowpageSets, FlowpageSetQuestion

class LessonRepository(BaseRepository):

    async def list_flowpage_sets_with_questions_by_lesson_item_id(self, lesson_item_id: int) -> List[dict]:
        """
        指定したlesson_item_idに紐づく演習セット(flowpage_sets)と、
        各セット内の問題(flowpage_set_question)一覧を取得します。
        """
        # 1. lesson_item_idでflowpage_setsを取得
        stmt_sets = select(FlowpageSets).where(FlowpageSets.lesson_item_id == lesson_item_id)
        result_sets = await self.db.execute(stmt_sets)
        sets = result_sets.scalars().all()
        results = []
        for flow_set in sets:
            # 2. 各セットのidでflowpage_set_questionを取得
            stmt_q = select(FlowpageSetQuestion).where(FlowpageSetQuestion.flowpage_set_id == flow_set.id)
            result_q = await self.db.execute(stmt_q)
            questions = result_q.scalars().all()
            question_list = []
            for q in questions:
                # 3. flowpage_idでFlowpages情報取得
                stmt_page = select(Flowpages).where(Flowpages.id == q.flowpage_id)
                page_obj = (await self.db.execute(stmt_page)).scalar_one_or_none()
                question_list.append(dict(
                    flowpage_id=q.flowpage_id,
                    title=page_obj.title if page_obj else None,
                    page_type=page_obj.page_type if page_obj else None,
                    display_order=q.display_order,
                    points=q.points
                ))
            results.append(dict(
                id=flow_set.id,
                title=flow_set.title,
                lesson_item_id=flow_set.lesson_item_id,
                time_limit_seconds=flow_set.time_limit_seconds,
                challenge_limit=flow_set.challenge_limit,
                questions=question_list
            ))
        return results
    """レッスン関連のデータ操作をまとめたリポジトリクラス"""

    async def create_lesson(self, *, lesson_in: lessons_schema.LessonCreate, created_by_user_id: int) -> lessons_model.CourseLessons:
        """新しいレッスンを作成します。"""
        db_obj = lessons_model.CourseLessons(
            **lesson_in.model_dump(),
            created_by_user_id=created_by_user_id
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_lesson_by_id(self, *, lesson_id: int) -> Optional[lessons_model.CourseLessons]:
        """IDでレッスンを一件取得します。"""
        stmt = select(lessons_model.CourseLessons).where(lessons_model.CourseLessons.id == lesson_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_lesson(self, *, lesson: lessons_model.CourseLessons, lesson_in: lessons_schema.LessonUpdate, updated_by_user_id: int) -> lessons_model.CourseLessons:
        """レッスン情報を更新します。"""
        update_data = lesson_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(lesson, field, value)
        lesson.updated_at = func.now()
        lesson.updated_by_user_id = updated_by_user_id
        self.db.add(lesson)
        await self.db.flush()
        await self.db.refresh(lesson)
        return lesson

    async def soft_delete_lesson(self, *, lesson: lessons_model.CourseLessons) -> lessons_model.CourseLessons:
        """レッスンを論理削除します。"""
        lesson.is_active = False
        lesson.deleted_at = func.now()
        self.db.add(lesson)
        await self.db.flush()
        await self.db.refresh(lesson)
        return lesson

    async def list_lessons_by_course_id(self, *, course_id: int, include_inactive: bool = False) -> List[lessons_model.CourseLessons]:
        """指定されたコースのレッスン一覧を取得します。
        
        レッスン項目(lesson_items)は読み込みません。
        コース情報は読み込みません。
        """
        stmt = select(lessons_model.CourseLessons).where(lessons_model.CourseLessons.course_id == course_id)
        if not include_inactive:
            stmt = stmt.where(lessons_model.CourseLessons.is_active == True)
        
        # lesson_itemsは読み込まず、course情報も読み込まない
        stmt = stmt.options(
            noload(lessons_model.CourseLessons.lesson_items),
            noload(lessons_model.CourseLessons.course) 
        )
        
        stmt = stmt.order_by(lessons_model.CourseLessons.lesson_number, lessons_model.CourseLessons.display_order)
        
        result = await self.db.execute(stmt)
        return result.scalars().unique().all()

    async def list_lessons_with_items_by_course_id(self, *, course_id: int, include_inactive: bool = False) -> List[lessons_model.CourseLessons]:
        """指定されたコースのレッスン一覧を取得します。
        
        レッスンに紐づくレッスン項目(lesson_items)も同時に取得します。
        コース情報は読み込みません。
        """
        stmt = select(lessons_model.CourseLessons).where(lessons_model.CourseLessons.course_id == course_id)
        if not include_inactive:
            stmt = stmt.where(lessons_model.CourseLessons.is_active == True)
        
        # lesson_itemsをEager Loadingで取得し、course情報は読み込まない
        stmt = stmt.options(
            selectinload(lessons_model.CourseLessons.lesson_items),
            noload(lessons_model.CourseLessons.course) 
        )
        
        stmt = stmt.order_by(lessons_model.CourseLessons.lesson_number, lessons_model.CourseLessons.display_order)
        
        result = await self.db.execute(stmt)
        return result.scalars().unique().all()

#
# Lesson Item Methods
#

    async def create_lesson_item(self, *, item_in: lessons_schema.LessonItemCreate, created_by_user_id: int) -> lessons_model.LessonItems:
        """新しいレッスン項目を作成します。"""
        db_obj = lessons_model.LessonItems(
            **item_in.model_dump(),
            created_by_user_id=created_by_user_id
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_lesson_item_by_id(self, *, item_id: int) -> Optional[lessons_model.LessonItems]:
        """IDでレッスン項目を一件取得します。"""
        stmt = select(lessons_model.LessonItems).where(lessons_model.LessonItems.id == item_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_lesson_item(self, *, item: lessons_model.LessonItems, item_in: lessons_schema.LessonItemUpdate, updated_by_user_id: int) -> lessons_model.LessonItems:
        """レッスン項目情報を更新します。"""
        update_data = item_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(item, field, value)
        item.updated_at = func.now()
        item.updated_by_user_id = updated_by_user_id
        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

    async def soft_delete_lesson_item(self, *, item: lessons_model.LessonItems) -> lessons_model.LessonItems:
        """レッスン項目を論理削除します。"""
        item.is_active = False
        item.deleted_at = func.now()
        self.db.add(item)
        await self.db.flush()
        await self.db.refresh(item)
        return item

#
# Lesson Page Methods
#

    async def create_lesson_page(self, *, page_in: lessons_schema.LessonPageCreate, created_by_user_id: int) -> lessons_model.LessonPages:
        """新しいレッスンページを作成します。"""
        db_obj = lessons_model.LessonPages(
            **page_in.model_dump(),
            created_by_user_id=created_by_user_id
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def get_lesson_page_by_id(self, *, page_id: int) -> Optional[lessons_model.LessonPages]:
        """IDでレッスンページを一件取得します。"""
        stmt = select(lessons_model.LessonPages).where(lessons_model.LessonPages.id == page_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def update_lesson_page(self, *, page: lessons_model.LessonPages, page_in: lessons_schema.LessonPageUpdate, updated_by_user_id: int) -> lessons_model.LessonPages:
        """レッスンページ情報を更新します。"""
        update_data = page_in.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(page, field, value)
        page.updated_at = func.now()
        page.updated_by_user_id = updated_by_user_id
        self.db.add(page)
        await self.db.flush()
        await self.db.refresh(page)
        return page

    async def soft_delete_lesson_page(self, *, page: lessons_model.LessonPages) -> lessons_model.LessonPages:
        """レッスンページを論理削除します。"""
        page.is_active = False
        page.deleted_at = func.now()
        self.db.add(page)
        await self.db.flush()
        await self.db.refresh(page)
        return page


    async def list_lesson_pages_with_content_body_by_lesson_item_id(self, *, lesson_item_id: int, content_repo: Optional[ContentRepository] = None) -> List[dict]:
        """
        指定したレッスン項目ID(lesson_item_id)に紐づく教科書ページ(lesson_pages)を全て取得し、
        各ページのraw_content_id/rendered_content_idに対応するcontent_bodyも含めて返します。
        content_repoのget_content_by_idを利用します。
        """
        stmt = select(lessons_model.LessonPages).where(lessons_model.LessonPages.lesson_item_id == lesson_item_id)
        result = await self.db.execute(stmt)
        pages = result.scalars().all()
        results = []
        for page in pages:
            raw_body = None
            rendered_body = None
            if page.raw_content_id and content_repo:
                raw_content_obj = await content_repo.get_content_by_id(content_id=page.raw_content_id)
                if raw_content_obj:
                    raw_body = raw_content_obj.content_body
            if page.rendered_content_id and content_repo:
                rendered_content_obj = await content_repo.get_content_by_id(content_id=page.rendered_content_id)
                if rendered_content_obj:
                    rendered_body = rendered_content_obj.content_body
            # 必要なフィールドのみ抽出
            page_dict = dict(
                id=page.id,
                lesson_item_id=page.lesson_item_id,
                page_number=page.page_number,
                raw_content_id=page.raw_content_id,
                rendered_content_id=page.rendered_content_id,
                is_active=page.is_active,
                title=page.title,
                visibility_start_date_time=page.visibility_start_date_time,
                visibility_end_date_time=page.visibility_end_date_time,
                is_always_visible=page.is_always_visible,
                created_at=page.created_at,
                created_by_user_id=page.created_by_user_id,
                updated_at=page.updated_at,
                updated_by_user_id=page.updated_by_user_id,
                deleted_at=page.deleted_at,
                raw_content_body=raw_body,
                rendered_content_body=rendered_body
            )
            results.append(page_dict)
        return results

    async def get_lesson_page_by_lesson_item_id(self, *, lesson_item_id: int) -> Optional[lessons_model.LessonPages]:
        """
        指定したレッスン項目ID(lesson_item_id)に紐づく教科書ページ(lesson_page)を取得します。
        lesson_itemのitem_content_typeが"textbook"である場合のみ、item_resource_idをlesson_pageのIDとして取得します。
        """
        stmt_item = select(lessons_model.LessonItems).where(lessons_model.LessonItems.id == lesson_item_id)
        lesson_item = (await self.db.execute(stmt_item)).scalar_one_or_none()
        if not lesson_item or lesson_item.item_content_type != "textbook" or not lesson_item.item_resource_id:
            return None
        stmt_page = select(lessons_model.LessonPages).where(lessons_model.LessonPages.id == lesson_item.item_resource_id)
        return (await self.db.execute(stmt_page)).scalar_one_or_none()
