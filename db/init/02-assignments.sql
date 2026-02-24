-- 課題・ファイル提出機能スキーマ

-- 25. assignments（課題定義）
CREATE TABLE assignments (
  id SERIAL PRIMARY KEY,
  lesson_id INT NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  -- 公開制御
  is_published BOOLEAN DEFAULT false NOT NULL,
  publish_start_at TIMESTAMP,          -- NULL = 即時公開 (is_published=true の場合)
  publish_end_at TIMESTAMP,            -- NULL = 無期限
  -- 提出制御
  due_date TIMESTAMP,                  -- 締切日時（NULL = 締切なし）
  allow_late_submission BOOLEAN DEFAULT true NOT NULL,
  max_file_size_mb INT DEFAULT 50,     -- アップロード可能な最大ファイルサイズ (MB)
  allowed_file_types VARCHAR(512),     -- カンマ区切り拡張子 e.g. ".pdf,.docx,.zip"（NULL = 全て許可）
  -- メタデータ
  display_order INT DEFAULT 1 NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP
);

-- 26. assignment_submissions（学生の提出物）
CREATE TABLE assignment_submissions (
  id SERIAL PRIMARY KEY,
  assignment_id INT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ファイル情報（サーバーのファイルシステムに保存）
  file_path VARCHAR(1024) NOT NULL,    -- サーバー上の保存パス
  original_filename VARCHAR(512) NOT NULL,
  file_size_bytes BIGINT,
  content_type VARCHAR(128),
  -- 提出バージョン管理
  submission_number INT DEFAULT 1 NOT NULL,  -- 再提出のたびにインクリメント
  is_latest BOOLEAN DEFAULT true NOT NULL,   -- 最新提出かどうか
  -- 採点（教師フィードバック）
  score DECIMAL(5,2),                  -- 点数（NULL = 未採点）
  max_score DECIMAL(5,2),             -- 満点
  teacher_comment TEXT,               -- 教師コメント
  graded_at TIMESTAMP,
  graded_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  -- メタデータ
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- インデックス
CREATE INDEX idx_assignments_lesson_id ON assignments(lesson_id);
CREATE INDEX idx_assignments_is_published ON assignments(is_published);
CREATE INDEX idx_assignment_submissions_assignment_id ON assignment_submissions(assignment_id);
CREATE INDEX idx_assignment_submissions_student_user_id ON assignment_submissions(student_user_id);
CREATE INDEX idx_assignment_submissions_is_latest ON assignment_submissions(is_latest);
