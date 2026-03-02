from typing import List, Optional

from api.repositories.subjects_repo import SubjectRepository
import api.schemas.subjects as subject_schema
import api.models.subjects_model as subject_model

class SubjectService:
    def __init__(self, subject_repo: SubjectRepository):
        self.subject_repo = subject_repo

    async def get_list(self, include_inactive: bool = False) -> List[subject_model.Subjects]:
        """科目の一覧を取得します。"""
        return await self.subject_repo.list(include_inactive=include_inactive)

    async def get_by_id(self, subject_id: int) -> Optional[subject_model.Subjects]:
        """指定されたIDの科目を一件取得します。"""
        return await self.subject_repo.get(subject_id=subject_id)

    async def create_subject_with_syllabus(self, subject_with_syllabus: subject_schema.SubjectWithSyllabusCreate, user_id: int) -> subject_model.Subjects:
        """科目とシラバス情報を同時に作成します。"""
        # 1. 科目を作成
        new_subject = await self.subject_repo.create(
            subject_in=subject_with_syllabus.subject, 
            created_by_user_id=user_id
        )
        
        # 2. シラバスを作成
        await self.subject_repo.upsert_syllabus(
            subject_id=new_subject.id, 
            syllabus_in=subject_with_syllabus.syllabus, 
            user_id=user_id
        )

        # トランザクションを確定して、他のリクエストからも参照できるようにする
        await self.subject_repo.db.commit()
        await self.subject_repo.db.refresh(new_subject)

        return new_subject

    async def update_subject(self, subject_id: int, subject_in: subject_schema.SubjectUpdate, user_id: int) -> None:
        """科目の情報を更新します。"""
        await self.subject_repo.update(subject_id=subject_id, subject_in=subject_in, updated_by_user_id=user_id)

    async def delete_subject(self, subject_id: int, user_id: int) -> None:
        """科目を論理削除します（非アクティブ化）。"""
        await self.subject_repo.delete(subject_id=subject_id, updated_by_user_id=user_id)

    async def get_semesters(self) -> List[subject_model.Semesters]:
        """学期マスタの一覧を取得します。"""
        return await self.subject_repo.list_semesters()

    async def get_subject_categories(self) -> List[subject_model.SubjectCategories]:
        """授業科目区分マスタの一覧を取得します。"""
        return await self.subject_repo.list_subject_categories()

    async def create_semester(self, semester_in: subject_schema.SemesterCreate) -> subject_model.Semesters:
        """学期マスタを新規作成します。"""
        semester = await self.subject_repo.create_semester(semester_in=semester_in)
        await self.subject_repo.db.commit()
        await self.subject_repo.db.refresh(semester)
        return semester
