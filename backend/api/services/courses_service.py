"""
コース関連のビジネスロジック

このモジュールでは、コースに関連するビジネスルールをカプセル化した
サービスクラスを定義します。
"""
from typing import List, Optional
from fastapi import HTTPException, status

from api.repositories.courses_repo import CourseRepository
from api.repositories.users_repo import UserRepository # 追加
from api.models import courses_model, users_model
import api.schemas.courses as courses_schema

class CourseService:
    """コース関連のビジネスロジックを担うサービスクラス"""

    def __init__(self, course_repo: CourseRepository, user_repo: UserRepository): # user_repoを追加
        """コンストラクタ"""
        self.course_repo = course_repo
        self.user_repo = user_repo # 追加

    async def get_enrolled_courses(self, *, user_id: int, include_inactive: bool = False) -> List[courses_model.Courses]:
        """ユーザーが履修しているコースの一覧を取得します。"""
        return await self.course_repo.list_enrolled_courses_by_user_id(user_id=user_id, include_inactive=include_inactive)

    async def get_courses_for_teacher(
        self, *, user_id: int, subject_id: int, include_inactive: bool = False
    ) -> List[courses_model.Courses]:
        """教師が閲覧可能な、特定の科目に紐づくコース一覧を取得します。"""
        return await self.course_repo.list_courses_by_permission(
            user_id=user_id, subject_id=subject_id, include_inactive=include_inactive
        )

    async def get_all_courses_by_subject_for_admin(
        self, *, subject_id: int, include_inactive: bool = False
    ) -> List[courses_model.Courses]:
        """（管理者向け）指定された科目に紐づく全てのコースを取得します。"""
        return await self.course_repo.list_all_courses_by_subject_id(
            subject_id=subject_id, include_inactive=include_inactive
        )

    async def get_course_by_id(self, *, course_id: int) -> Optional[courses_model.Courses]:
        """IDでコースを一件取得します。"""
        return await self.course_repo.get_course_by_id(course_id=course_id)

    async def grant_or_update_course_content_permission(
        self, 
        *, 
        course_id: int, 
        permission_in: courses_schema.CourseContentPermissionCreate, 
        current_user: users_model.Users
    ) -> Optional[courses_model.CourseContentPermissions]:
        """コースコンテンツ権限を付与または更新します。

        ターゲットユーザーが管理者である場合は操作を許可しません。
        """
        # ターゲットユーザーが管理者である場合は操作を許可しない
        target_user = await self.user_repo.get_by_id(user_id=permission_in.teacher_user_id)
        if target_user and target_user.role_id == 1: # Assuming 1 is admin role_id
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Permissions for administrators cannot be managed explicitly."
            )

        # コースの存在確認と作成者IDの取得
        course_creator_id = await self.course_repo.get_course_creator_id(course_id=course_id)
        if course_creator_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

        # 権限チェック
        is_admin = current_user.role_id == 1
        is_course_creator = current_user.id == course_creator_id
        
        # 現在のユーザーの当該コースに対する権限を取得
        current_user_permission = await self.course_repo.get_course_content_permission(
            user_id=current_user.id, course_id=course_id
        )
        can_current_user_update = current_user_permission and current_user_permission.can_update_content

        # 許可される権限の範囲を決定
        if is_admin or is_course_creator:
            # 管理者またはコース作成者は全ての権限を付与可能
            pass
        elif can_current_user_update:
            # can_update_content 権限を持つユーザーは、can_read_content と can_update_content のみ付与可能
            if permission_in.can_delete_content:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You do not have permission to grant delete content permission."
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to grant course content permissions."
            )

        # 権限の自動設定（階層性）
        if permission_in.can_delete_content:
            permission_in.can_update_content = True
            permission_in.can_read_content = True
        elif permission_in.can_update_content:
            permission_in.can_read_content = True

        # 権限の作成または更新
        existing_permission = await self.course_repo.get_course_content_permission(
            user_id=permission_in.teacher_user_id, course_id=permission_in.course_id
        )

        # 全ての権限がFalseになった場合、権限エントリを削除
        if not permission_in.can_read_content and \
           not permission_in.can_update_content and \
           not permission_in.can_delete_content:
            if existing_permission:
                await self.course_repo.delete_course_content_permission(permission=existing_permission)
                await self.course_repo.db.commit()
                return None # 削除されたことを示す
            else:
                return None # 元々存在しないので何もしない

        if existing_permission:
            # 更新
            updated_permission = await self.course_repo.update_course_content_permission(
                permission=existing_permission,
                permission_in=courses_schema.CourseContentPermissionUpdate(
                    can_read_content=permission_in.can_read_content,
                    can_update_content=permission_in.can_update_content,
                    can_delete_content=permission_in.can_delete_content,
                )
            )
            await self.course_repo.db.commit()
            return updated_permission
        else:
            # 新規作成
            created_permission = await self.course_repo.create_course_content_permission(
                permission_in=permission_in,
                created_by_user_id=current_user.id
            )
            await self.course_repo.db.commit()
            return created_permission

    async def grant_or_update_course_content_permissions_batch(
        self, 
        *, 
        course_id: int, 
        permissions_in: List[courses_schema.CourseContentPermissionCreate], 
        current_user: users_model.Users
    ) -> List[Optional[courses_model.CourseContentPermissions]]:
        """複数のコースコンテンツ権限を一括で付与または更新します。

        Args:
            course_id: 権限を付与するコースのID
            permissions_in: 付与する権限情報のリスト
            current_user: 操作を実行しているユーザー

        Returns:
            更新または作成されたコースコンテンツ権限モデルのリスト

        Raises:
            HTTPException: 権限がない場合やコースが見つからない場合
        """
        results = []
        async with self.course_repo.db.begin_nested(): # バッチ操作全体をトランザクションでラップ
            for permission_data in permissions_in:
                # 各権限付与操作は個別のトランザクションではなく、ネストされたトランザクションとして実行
                # grant_or_update_course_content_permission 内で commit/rollback は行わない
                result = await self.grant_or_update_course_content_permission(
                    course_id=course_id,
                    permission_in=permission_data,
                    current_user=current_user
                )
                results.append(result)
        await self.course_repo.db.commit() # バッチ操作全体のコミット
        return results

    async def enroll_students_in_course_batch(
        self, 
        *, 
        course_id: int, 
        enrollments_in: List[courses_schema.CourseEnrollmentCreate], 
        current_user: users_model.Users
    ) -> List[courses_model.CourseEnrollments]:
        """複数の学生をコースに一括で登録します。

        Args:
            course_id: 登録対象のコースID
            enrollments_in: 履修登録情報のリスト
            current_user: 操作を実行しているユーザー

        Returns:
            登録または更新された履修モデルのリスト

        Raises:
            HTTPException: 権限がない場合や、ユーザー/教師の役割が不正な場合
        """
        results = []
        async with self.course_repo.db.begin_nested():
            for enrollment_data in enrollments_in:
                # 操作ユーザーの権限チェック
                is_admin = current_user.role_id == 1
                is_teacher = current_user.role_id == 2
                if not (is_admin or is_teacher):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to enroll students."
                    )

                # 登録対象ユーザーの役割チェック (学生のみ)
                target_user = await self.user_repo.get_by_id(user_id=enrollment_data.user_id)
                if not target_user or target_user.role_id != 3: # Assuming 3 is student role_id
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"User {enrollment_data.user_id} is not a student or does not exist."
                    )
                
                enrollment_data_fixed = enrollment_data.model_copy(update={"course_id": course_id})

                # 履修登録の作成または更新
                existing_enrollment = await self.course_repo.get_course_enrollment(
                    user_id=enrollment_data.user_id, course_id=course_id
                )

                if existing_enrollment:
                    # 更新
                    updated_enrollment = await self.course_repo.update_course_enrollment(
                        enrollment=existing_enrollment,
                        enrollment_in=enrollment_data_fixed
                    )
                    results.append(updated_enrollment)
                else:
                    # 新規作成
                    created_enrollment = await self.course_repo.create_course_enrollment(
                        enrollment_in=enrollment_data_fixed
                    )
                    results.append(created_enrollment)
        await self.course_repo.db.commit()
        return results

    async def unenroll_students_from_course_batch(
        self, 
        *, 
        course_id: int, 
        user_ids: List[int], 
        current_user: users_model.Users
    ) -> bool:
        """複数の学生をコースから一括で登録解除します。

        Args:
            course_id: 登録解除対象のコースID
            user_ids: 登録解除するユーザーIDのリスト
            current_user: 操作を実行しているユーザー

        Returns:
            登録解除が成功したかどうか

        Raises:
            HTTPException: 権限がない場合
        """
        # 操作ユーザーの権限チェック
        is_admin = current_user.role_id == 1
        is_teacher = current_user.role_id == 2
        if not (is_admin or is_teacher):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to unenroll students."
            )

        async with self.course_repo.db.begin_nested():
            for user_id in user_ids:
                success = await self.course_repo.delete_course_enrollment(
                    user_id=user_id, course_id=course_id
                )
                if not success:
                    # 個別の削除失敗はログに記録するか、エラーを返すか検討
                    # ここでは、バッチ全体としては成功とみなすため、個別の失敗は無視
                    pass
        await self.course_repo.db.commit()
        return True

    async def update_course(
        self, *, course_id: int, course_in: courses_schema.CourseUpdate, current_user: users_model.Users
    ) -> Optional[courses_model.Courses]:
        """コース情報を更新します。

        Args:
            course_id: 更新対象のコースID
            course_in: 更新するコース情報
            current_user: 操作を実行しているユーザー

        Returns:
            更新されたコースモデル、またはNone（コースが見つからない場合）

        Raises:
            HTTPException: 権限がない場合
        """
        course = await self.course_repo.get_course_by_id(course_id=course_id)
        if course is None:
            return None

        # 権限チェック
        is_admin = current_user.role_id == 1
        is_course_creator = current_user.id == course.created_by_user_id
        
        current_user_permission = await self.course_repo.get_course_content_permission(
            user_id=current_user.id, course_id=course_id
        )
        can_update_content = current_user_permission and current_user_permission.can_update_content

        if not (is_admin or is_course_creator or can_update_content):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to update this course."
            )

        updated_course = await self.course_repo.update_course(course=course, course_in=course_in)
        await self.course_repo.db.commit()
        return updated_course

    async def delete_course(
        self, *, course_id: int, current_user: users_model.Users
    ) -> bool:
        """コースを論理削除します。

        Args:
            course_id: 削除対象のコースID
            current_user: 操作を実行しているユーザー

        Returns:
            削除が成功したかどうか

        Raises:
            HTTPException: 権限がない場合
        """
        course = await self.course_repo.get_course_by_id(course_id=course_id)
        if course is None:
            return False

        # 権限チェック
        is_admin = current_user.role_id == 1
        is_course_creator = current_user.id == course.created_by_user_id
        
        current_user_permission = await self.course_repo.get_course_content_permission(
            user_id=current_user.id, course_id=course_id
        )
        can_delete_content = current_user_permission and current_user_permission.can_delete_content

        if not (is_admin or is_course_creator or can_delete_content):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to delete this course."
            )

        await self.course_repo.soft_delete_course(course=course)
        await self.course_repo.db.commit()
        return True