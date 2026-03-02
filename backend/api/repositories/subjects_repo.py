from typing import Optional, List, Type
from sqlalchemy import select, update, func
from sqlalchemy.orm import selectinload
from sqlalchemy.engine import Result

from api.repositories.base import BaseRepository
import api.models.subjects_model as subject_model
import api.schemas.subjects as subject_schema

class SubjectRepository(BaseRepository):
    
    async def list(self, *, include_inactive: bool = False) -> List[subject_model.Subjects]:
        stmt = (
            select(subject_model.Subjects)
            .options(selectinload(subject_model.Subjects.semester))
            .order_by(subject_model.Subjects.id)
        )
        if not include_inactive:
            stmt = stmt.where(subject_model.Subjects.is_active.is_(True))
        res: Result = await self.db.execute(stmt)
        return res.scalars().all()

    async def get(self, *, subject_id: int, include_inactive: bool = False) -> Optional[subject_model.Subjects]:
        stmt = (
            select(subject_model.Subjects)
            .options(selectinload(subject_model.Subjects.semester))
            .where(subject_model.Subjects.id == subject_id)
        )
        if not include_inactive:
            stmt = stmt.where(subject_model.Subjects.is_active.is_(True))
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def create(self, *, subject_in: subject_schema.SubjectCreate, created_by_user_id: int) -> subject_model.Subjects:
        db_obj = subject_model.Subjects(
            **subject_in.model_dump(),
            updated_by_user_id=created_by_user_id # created_by_user_idも設定するべきか要確認
        )
        self.db.add(db_obj)
        await self.db.flush()
        await self.db.refresh(db_obj)
        return db_obj

    async def update(self, *, subject_id: int, subject_in: subject_schema.SubjectUpdate, updated_by_user_id: int) -> None:
        values = subject_in.model_dump(exclude_unset=True)
        values["updated_by_user_id"] = updated_by_user_id
        
        if values:
            stmt = (
                update(subject_model.Subjects)
                .where(subject_model.Subjects.id == subject_id)
                .values(**values)
            )
            await self.db.execute(stmt)

    async def delete(self, *, subject_id: int, updated_by_user_id: int) -> None:
        stmt = (
            update(subject_model.Subjects)
            .where(subject_model.Subjects.id == subject_id, subject_model.Subjects.is_active.is_(True))
            .values(
                is_active=False,
                deleted_at=func.now(),
                updated_at=func.now(),
                updated_by_user_id=updated_by_user_id
            )
        )
        await self.db.execute(stmt)

    async def upsert_syllabus(self, *, subject_id: int, syllabus_in: subject_schema.SubjectSyllabusCreate, user_id: int):
        exist = await self.db.get(subject_model.SubjectSyllabuses, subject_id)
        if exist is None:
            syl = subject_model.SubjectSyllabuses(
                subject_id=subject_id,
                **syllabus_in.model_dump(),
                created_by_user_id=user_id,
                updated_by_user_id=user_id,
            )
            self.db.add(syl)
        else:
            update_data = syllabus_in.model_dump(exclude_unset=True)
            update_data["updated_by_user_id"] = user_id
            for key, value in update_data.items():
                setattr(exist, key, value)
            await self.db.flush()

    async def list_semesters(self) -> List[subject_model.Semesters]:
        stmt = select(subject_model.Semesters).order_by(subject_model.Semesters.sort_order)
        res: Result = await self.db.execute(stmt)
        return res.scalars().all()

    async def list_subject_categories(self) -> List[subject_model.SubjectCategories]:
        stmt = select(subject_model.SubjectCategories).order_by(subject_model.SubjectCategories.id)
        res: Result = await self.db.execute(stmt)
        return res.scalars().all()
