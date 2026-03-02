from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List

# Shared properties
class SubjectBase(BaseModel):
    subject_name: Optional[str] = Field(None, description="科目名")
    academic_year: Optional[int] = Field(None, description="開講年")
    semester_id: Optional[int] = Field(None, description="開講時期")
    is_active: bool = Field(True, description="有効フラグ")

# Properties to receive on item creation
class SubjectCreate(SubjectBase):
    subject_name: str = Field(..., description="科目名")
    academic_year: int = Field(..., description="開講年")
    semester_id: int = Field(..., description="開講時期")

# Properties to receive on item update
class SubjectUpdate(SubjectBase):
    pass

# New: Semester Schema
class Semester(BaseModel):
    id: int
    name: str
    created_at: datetime
    updated_at: datetime
    sort_order: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

# Properties shared by models stored in DB
class SubjectInDBBase(SubjectBase):
    id: int = Field(..., description="科目ID")
    subject_name: str = Field(..., description="科目名")
    academic_year: int = Field(..., description="開講年")
    semester_id: int = Field(..., description="開講時期")
    is_active: bool = Field(..., description="有効フラグ")
    created_at: datetime = Field(..., description="作成日時")
    updated_at: datetime = Field(..., description="更新日時")
    updated_by_user_id: Optional[int] = Field(None, description="最終更新者ID")
    
    # New: Nested Semester
    semester: Semester # This will be loaded via relationship

    model_config = ConfigDict(from_attributes=True)

# Properties to return to client (full details)
class Subject(SubjectInDBBase):
    pass

# Properties for simple list display (e.g., ID and name)
class SubjectSimple(BaseModel):
    id: int = Field(..., description="科目ID")
    subject_name: str = Field(..., description="科目名")
    model_config = ConfigDict(from_attributes=True)


# Properties stored in DB
class SubjectInDB(SubjectInDBBase):
    pass

# New: Subject schema with semester for Course response
class SubjectWithSemester(SubjectInDBBase):
    pass

class SubjectSyllabusBase(BaseModel):
    subject_category_id: Optional[int] = Field(None, description="授業科目区分")
    credits: Optional[int] = Field(None, description="単位数")
    code: Optional[str] = Field(None, description="科目コード")
    keywords: Optional[dict] = Field(None, description="キーワード")
    learning_goal: Optional[str] = Field(None, description="学習・教育目標")
    summary: Optional[str] = Field(None, description="授業の概要")
    prerequisites: Optional[str] = Field(None, description="履修に必要な予備知識や技能")
    behavioral_objectives: Optional[dict] = Field(None, description="理想的な達成レベルの目安")
    achievement_targets: Optional[dict] = Field(None, description="標準的な達成レベルの目安")

class SubjectSyllabusCreate(SubjectSyllabusBase):
    subject_category_id: int = Field(..., description="授業科目区分")
    credits: int = Field(..., description="単位数")
    code: str = Field(..., description="科目コード")
    learning_goal: str = Field(..., description="学習・教育目標")
    summary: str = Field(..., description="授業の概要")
    prerequisites: str = Field(..., description="履修に必要な予備知識や技能")
    behavioral_objectives: dict = Field(..., description="理想的な達成レベルの目安")
    achievement_targets: dict = Field(..., description="標準的な達成レベルの目安")

class SubjectSyllabusUpdate(SubjectSyllabusBase):
    pass

class SubjectWithSyllabusCreate(BaseModel):
    subject: SubjectCreate
    syllabus: SubjectSyllabusCreate

# Master data schemas
class SemesterSimple(BaseModel):
    id: int
    name: str
    sort_order: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)

class SubjectCategorySimple(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)