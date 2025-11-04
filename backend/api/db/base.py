# Baseのインポート集約
from api.db.session import Base

from api.models.users_model import Users, Roles, Students
from api.models.progress_model import Goals
from api.models.subjects_model import Subjects, SubjectCategories, SubjectSyllabuses, Semesters
from api.models.courses_model import Courses, CourseContentPermissions, CourseEnrollments
from api.models.lessons_model import CourseLessons, LessonItems, LessonPages, TextbookMarkers
from api.models.flowpages_model import Flowpages, FlowpageBlanks, Hints, QuestionChoices, CorrectAnswer, FlowpageKeywordDependency, FlowpageSets, FlowpageSetQuestion
from api.models.flow_sessions_model import FlowSessions, FlowSessionQuestion, Answer
from api.models.contents_model import Contents, Images
from api.models.adaptive_model import LearningRecommendations, StudentCompetencies