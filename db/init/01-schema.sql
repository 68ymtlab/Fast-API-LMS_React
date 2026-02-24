-- LMS Schema (docs/table_improved.md 準拠)
-- Pure PostgreSQL, Supabase 非依存

-- 1. roles
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. semesters
CREATE TABLE semesters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  sort_order INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. subject_categories
CREATE TABLE subject_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255),
  display_name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  theme_settings TEXT,
  is_disabled BOOLEAN DEFAULT false,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

-- 5. goals（目標）
CREATE TABLE goals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_achieved BOOLEAN DEFAULT false NOT NULL,
  is_point_granted BOOLEAN DEFAULT false NOT NULL,
  is_disabled BOOLEAN DEFAULT false NOT NULL,
  achieved_at TIMESTAMP
);

-- 6. students
CREATE TABLE students (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade INT,
  department VARCHAR(255),
  student_number VARCHAR(64),
  class_number VARCHAR(255),
  class_roster_number VARCHAR(64),
  points INT DEFAULT 0,
  login_days INT DEFAULT 0 NOT NULL,
  student_metadata JSONB
);

-- 7. contents
CREATE TABLE contents (
  id SERIAL PRIMARY KEY,
  content_body TEXT NOT NULL,
  format_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  version_notes VARCHAR(255)
);

-- 8. subjects
CREATE TABLE subjects (
  id SERIAL PRIMARY KEY,
  subject_name VARCHAR(255) NOT NULL,
  academic_year INT,
  semester_id INT NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP
);

-- 9. subject_syllabuses
CREATE TABLE subject_syllabuses (
  subject_id INT PRIMARY KEY REFERENCES subjects(id) ON DELETE CASCADE,
  subject_category_id INT NOT NULL REFERENCES subject_categories(id) ON DELETE RESTRICT,
  credits INT NOT NULL,
  code VARCHAR(50) NOT NULL,
  keywords JSONB,
  learning_goal TEXT,
  summary TEXT,
  prerequisites TEXT,
  behavioral_objectives JSONB,
  achievement_targets JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL
);

-- 10. courses
CREATE TABLE courses (
  id SERIAL PRIMARY KEY,
  subject_id INT REFERENCES subjects(id) ON DELETE SET NULL,
  course_name VARCHAR(255) NOT NULL,
  description TEXT,
  session_count INT,
  target_audience VARCHAR(255),
  start_date_time TIMESTAMP NOT NULL,
  end_date_time TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP
);

-- 11. course_enrollments
CREATE TABLE course_enrollments (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  last_accessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (user_id, course_id)
);

-- 12. course_content_permissions
CREATE TABLE course_content_permissions (
  teacher_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  start_date_time TIMESTAMP NOT NULL,
  end_date_time TIMESTAMP NOT NULL,
  can_read_content BOOLEAN DEFAULT false NOT NULL,
  can_update_content BOOLEAN DEFAULT false NOT NULL,
  can_delete_content BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  PRIMARY KEY (teacher_user_id, course_id)
);

-- 13. course_lessons (旧 week)
CREATE TABLE course_lessons (
  id SERIAL PRIMARY KEY,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(128) NOT NULL,
  lesson_number INT NOT NULL,
  description TEXT,
  display_order INT DEFAULT 1 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP
);

-- 14. images
CREATE TABLE images (
  id SERIAL PRIMARY KEY,
  file_path VARCHAR(1024) NOT NULL,
  alt_text VARCHAR(255),
  original_name VARCHAR(255)
);

-- 15. lesson_pages (旧 Block)
CREATE TABLE lesson_pages (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  title VARCHAR(255),
  raw_content_id INT REFERENCES contents(id) ON DELETE SET NULL,
  rendered_content_id INT REFERENCES contents(id) ON DELETE SET NULL,
  visibility_start_date_time TIMESTAMP,
  visibility_end_date_time TIMESTAMP,
  is_always_visible BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP
);

-- 16. lesson_items
CREATE TABLE lesson_items (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  item_content_type VARCHAR(50) NOT NULL,
  item_resource_id INT,
  item_url VARCHAR(2048),
  display_order INT NOT NULL,
  item_data_details JSONB,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP
);

-- 17. questions
CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  question_type VARCHAR(50) NOT NULL,
  difficulty INT,
  content_data JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. tags
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  slug VARCHAR(50)
);

-- 19. question_tags
CREATE TABLE question_tags (
  question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);

-- 20. exercise_sets
CREATE TABLE exercise_sets (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  course_id INT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  question_ids JSONB NOT NULL,
  due_date TIMESTAMP
);

-- 21. exercise_sessions
CREATE TABLE exercise_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_set_id INT NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  score DECIMAL(5,2),
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP
);

-- 22. student_answers
CREATE TABLE student_answers (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES exercise_sessions(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_data JSONB NOT NULL,
  is_correct BOOLEAN
);

-- 23. textbook_markers
CREATE TABLE textbook_markers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_page_id INT NOT NULL REFERENCES lesson_pages(id) ON DELETE CASCADE,
  exact_text TEXT NOT NULL,
  text_prefix TEXT NOT NULL,
  text_suffix TEXT NOT NULL,
  color VARCHAR(20) DEFAULT 'yellow',
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 23-1. access_histories
CREATE TABLE access_histories (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_date DATE NOT NULL,
  page VARCHAR(255) NOT NULL,
  time INT NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- 24. student_competencies
CREATE TABLE student_competencies (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  mastery_level DECIMAL(5,4),
  last_assessed_at TIMESTAMP,
  PRIMARY KEY (user_id, subject_id)
);

-- 初期データ: roles（初回起動時に実行）
INSERT INTO roles (name, description) VALUES
  ('admin', '管理者'),
  ('teacher', '教師'),
  ('student', '学生'),
  ('test', 'テスト');
