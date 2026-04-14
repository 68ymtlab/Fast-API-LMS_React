-- 既存DB向け: 論理削除済みユーザーのメールアドレスを退避し、再登録を可能にする
-- users.email は UNIQUE 制約のため、deleted_at が入っていても元メールのままだと再利用不可

UPDATE users
SET
  email = 'deleted+' || id::text || '+' || substr(md5(random()::text || clock_timestamp()::text), 1, 12) || '@example.invalid',
  updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NOT NULL
  AND email NOT LIKE 'deleted+%@example.invalid';
