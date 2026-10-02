# db/init/ - DB 初期化

## 構成

| ファイル/フォルダ | 説明 |
|-------------------|------|
| **01-schema.sql** | 現行スキーマ（table_improved.md 準拠）。Docker 初回起動時に実行される |
| **06-tutor-schema.sql** | AI チューター用 `tutor` スキーマ（kb_versions / conversations / turns / learner_profiles / question_exposures / turn_feedback / settings / ビュー）。新規 volume 用。**既存 DB には tutor サービスが起動時に同じ DDL を `IF NOT EXISTS` で適用する**（`tutor/app/store.py` の `DDL`。両者を一致させる） |

## 実行順序

PostgreSQL の Docker イメージは `/docker-entrypoint-initdb.d/` 内の `.sql` をアルファベット順で実行する。
現状は `01-schema.sql` のみマウントされている。
