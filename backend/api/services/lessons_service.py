"""
レッスン関連のビジネスロジック

このモジュールでは、レッスンに関連するビジネスルールをカプセル化した
サービスクラスを定義します。
"""
from typing import List, Dict
from api.repositories.lessons_repo import LessonRepository
from api.models import lessons_model


class LessonService:
    """レッスン関連のビジネスロジックを担うサービスクラス"""

    def __init__(self, lesson_repo: LessonRepository):
        """コンストラクタ"""
        self.lesson_repo = lesson_repo

    async def get_lesson_item_by_id(self, lesson_item_id: int):
        """指定したレッスン項目IDに対応するレッスン項目情報を取得します。"""
        return await self.lesson_repo.get_lesson_item_by_id(item_id=lesson_item_id)

    async def get_lessons_by_course_id(self, *, course_id: int, include_inactive: bool = False) -> List[lessons_model.CourseLessons]:
        """指定されたコースのレッスン一覧を取得します。"""
        return await self.lesson_repo.list_lessons_by_course_id(course_id=course_id, include_inactive=include_inactive)

    async def get_lesson_items_by_course_id(self, *, course_id: int, include_inactive: bool = False) -> Dict[int, List[lessons_model.LessonItems]]:
        """指定されたコースのすべてのレッスン項目を、レッスンIDをキーとする辞書で取得します。"""
        lessons = await self.lesson_repo.list_lessons_with_items_by_course_id(course_id=course_id, include_inactive=include_inactive)
        if include_inactive:
            items_by_lesson = {lesson.id: lesson.lesson_items for lesson in lessons}
        else:
            # lesson_items は relationship 読み込み時に is_active 条件が付かないため、
            # API 返却時に明示的に非アクティブ項目を除外する。
            items_by_lesson = {
                lesson.id: [item for item in lesson.lesson_items if item.is_active]
                for lesson in lessons
            }
        return items_by_lesson

    async def list_lesson_pages_with_content_body_by_lesson_item_id(self, *, lesson_item_id: int, content_repo):
        """指定したレッスン項目IDに紐づく教科書ページを全て取得し、content_bodyも含めて返します。"""
        return await self.lesson_repo.list_lesson_pages_with_content_body_by_lesson_item_id(
            lesson_item_id=lesson_item_id, content_repo=content_repo
        )

    async def list_flowpage_sets_with_questions_by_lesson_item_id(self, lesson_item_id: int) -> List[dict]:
        """
        指定したlesson_item_idに紐づく演習セット＋セット内問題一覧を取得します。
        新スキーマでは flowpage_sets は廃止。exercise_sets に移行済み。
        互換性のため空リストを返します。
        """
        return []
