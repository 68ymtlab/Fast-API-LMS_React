-- 既存DBへの students カラム追加マイグレーション
-- 新規DBでは 01-schema.sql に含まれているため不要

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'student_number'
  ) THEN
    ALTER TABLE students ADD COLUMN student_number VARCHAR(64);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'class_roster_number'
  ) THEN
    ALTER TABLE students ADD COLUMN class_roster_number VARCHAR(64);
  END IF;
END $$;
