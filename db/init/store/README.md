# store/ - 未使用 SQL（Supabase 関連）

純粋 PostgreSQL 移行に伴い、このディレクトリに退避したファイルです。
現行の DB 初期化では `01-schema.sql` のみを使用しています。

## ファイル一覧

| ファイル | 用途 |
|----------|------|
| _supabase.sql | Supabase 用 `_supabase` データベース作成 |
| jwt.sql | JWT 設定（Supabase Auth） |
| logs.sql | ログ・分析スキーマ |
| pooler.sql | Supavisor 接続プール |
| realtime.sql | Realtime スキーマ |
| roles.sql | Supabase ロール（anon, authenticated 等） |
| webhooks.sql | Supabase Functions フック |

## 復元が必要な場合

Supabase に戻す場合は、このディレクトリのファイルを `db/init/` 直下に戻して docker-compose を調整してください。
