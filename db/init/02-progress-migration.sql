-- 既存DBへの goals テーブルと students 拡張のマイグレーション
-- 新規DBでは 01-schema.sql に含まれているため不要

-- goals テーブル（存在しない場合のみ作成）
CREATE TABLE IF NOT EXISTS goals (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_achieved BOOLEAN DEFAULT false NOT NULL,
  is_point_granted BOOLEAN DEFAULT false NOT NULL,
  is_disabled BOOLEAN DEFAULT false NOT NULL,
  achieved_at TIMESTAMP
);

-- students に login_days カラムを追加（存在しない場合のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'students' AND column_name = 'login_days'
  ) THEN
    ALTER TABLE students ADD COLUMN login_days INT DEFAULT 0 NOT NULL;
  END IF;
END $$;
