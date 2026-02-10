# db/init/ - DB 初期化

## 構成

| ファイル/フォルダ | 説明 |
|-------------------|------|
| **01-schema.sql** | 現行スキーマ（table_improved.md 準拠）。Docker 初回起動時に実行される |
| **store/** | 未使用の Supabase 関連 SQL（退避済み） |

## 実行順序

PostgreSQL の Docker イメージは `/docker-entrypoint-initdb.d/` 内の `.sql` をアルファベット順で実行する。
現状は `01-schema.sql` のみマウントされている。
