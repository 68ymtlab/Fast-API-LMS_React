from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from api.core.security import get_current_active_user, require_teacher_or_higher
from api.db.session import get_db
from api.models.users_model import Users

announcements_router = APIRouter(tags=["お知らせ管理"])


class AnnouncementCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=5000)
    start_date_time: datetime
    end_date_time: datetime
    sender: str = Field(min_length=1, max_length=255)
    user_kind_id: int
    is_active: bool = True


class AnnouncementUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=5000)
    start_date_time: datetime
    end_date_time: datetime
    user_kind_id: int


async def ensure_announcement_tables(db: AsyncSession) -> None:
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS public.announcements (
                id SERIAL PRIMARY KEY,
                title VARCHAR(200) NOT NULL,
                content TEXT NOT NULL,
                start_date_time TIMESTAMPTZ NOT NULL,
                end_date_time TIMESTAMPTZ NOT NULL,
                send_date_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                sender VARCHAR(255) NOT NULL,
                user_kind_id INTEGER NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_by_user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
    )
    await db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS public.announcement_reads (
                id SERIAL PRIMARY KEY,
                announcement_id INTEGER NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
                read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (announcement_id, user_id)
            )
            """
        )
    )
    await db.commit()


@announcements_router.get("/announcements_list")
async def get_announcements_for_current_user(
    current_user: Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_announcement_tables(db)

    result = await db.execute(
        text(
            """
            SELECT
                a.id,
                a.title,
                a.content,
                a.start_date_time,
                a.end_date_time,
                a.send_date_time,
                a.sender,
                a.user_kind_id,
                a.is_active,
                CASE WHEN ar.id IS NULL THEN FALSE ELSE TRUE END AS is_read
            FROM public.announcements a
            LEFT JOIN public.announcement_reads ar
                ON ar.announcement_id = a.id
               AND ar.user_id = :user_id
            WHERE a.user_kind_id = :user_kind_id
            ORDER BY a.send_date_time DESC, a.id DESC
            """
        ),
        {"user_id": current_user.id, "user_kind_id": current_user.role_id},
    )
    return [dict(row) for row in result.mappings().all()]


@announcements_router.get("/announcements_list_all")
async def get_all_announcements(
    _current_user: Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    await ensure_announcement_tables(db)

    result = await db.execute(
        text(
            """
            SELECT
                id,
                title,
                content,
                start_date_time,
                end_date_time,
                send_date_time,
                sender,
                user_kind_id,
                is_active
            FROM public.announcements
            ORDER BY send_date_time DESC, id DESC
            """
        )
    )
    return [dict(row) for row in result.mappings().all()]


@announcements_router.post("/announcements", status_code=status.HTTP_201_CREATED)
async def create_announcement(
    payload: AnnouncementCreate,
    current_user: Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    if payload.end_date_time <= payload.start_date_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date_time must be after start_date_time",
        )

    await ensure_announcement_tables(db)
    result = await db.execute(
        text(
            """
            INSERT INTO public.announcements (
                title,
                content,
                start_date_time,
                end_date_time,
                sender,
                user_kind_id,
                is_active,
                created_by_user_id
            )
            VALUES (
                :title,
                :content,
                :start_date_time,
                :end_date_time,
                :sender,
                :user_kind_id,
                :is_active,
                :created_by_user_id
            )
            RETURNING id
            """
        ),
        {
            "title": payload.title,
            "content": payload.content,
            "start_date_time": payload.start_date_time,
            "end_date_time": payload.end_date_time,
            "sender": payload.sender,
            "user_kind_id": payload.user_kind_id,
            "is_active": payload.is_active,
            "created_by_user_id": current_user.id,
        },
    )
    await db.commit()
    new_id = result.scalar_one()
    return {"id": new_id}


@announcements_router.put("/announcements/{announcement_id}")
async def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    _current_user: Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    if payload.end_date_time <= payload.start_date_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date_time must be after start_date_time",
        )

    await ensure_announcement_tables(db)
    result = await db.execute(
        text(
            """
            UPDATE public.announcements
            SET
                title = :title,
                content = :content,
                start_date_time = :start_date_time,
                end_date_time = :end_date_time,
                user_kind_id = :user_kind_id,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :announcement_id
            """
        ),
        {
            "announcement_id": announcement_id,
            "title": payload.title,
            "content": payload.content,
            "start_date_time": payload.start_date_time,
            "end_date_time": payload.end_date_time,
            "user_kind_id": payload.user_kind_id,
        },
    )
    if result.rowcount == 0:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")

    await db.commit()
    return {"message": "ok"}


@announcements_router.delete("/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    _current_user: Users = Depends(require_teacher_or_higher),
    db: AsyncSession = Depends(get_db),
):
    await ensure_announcement_tables(db)
    result = await db.execute(
        text("DELETE FROM public.announcements WHERE id = :announcement_id"),
        {"announcement_id": announcement_id},
    )
    if result.rowcount == 0:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")

    await db.commit()
    return {"message": "ok"}


@announcements_router.post("/announcements/{announcement_id}/read")
async def mark_announcement_as_read(
    announcement_id: int,
    current_user: Users = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_announcement_tables(db)

    exists_result = await db.execute(
        text("SELECT id FROM public.announcements WHERE id = :announcement_id"),
        {"announcement_id": announcement_id},
    )
    if exists_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")

    await db.execute(
        text(
            """
            INSERT INTO public.announcement_reads (announcement_id, user_id)
            VALUES (:announcement_id, :user_id)
            ON CONFLICT (announcement_id, user_id)
            DO NOTHING
            """
        ),
        {"announcement_id": announcement_id, "user_id": current_user.id},
    )
    await db.commit()
    return {"message": "ok"}

