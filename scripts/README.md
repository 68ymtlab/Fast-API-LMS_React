# scripts

| スクリプト | 用途 | 実行場所 |
|---|---|---|
| `deploy.sh` | 本番デプロイ（バックアップ → ビルド → 起動）。データ保持 | 本番 |
| `backup.sh` | 手動のバックアップ（DB・アップロード。別マシンへのコピーは任意）。cron でも使える | 本番 |
| （`backup` コンテナ） | **定期バックアップ**（`backup/run.sh`。DB を4時間ごと・アップロードを1日ごとに、ホストの `db/backups/` へ）。`docker-compose.prod.yml` の `backup` サービスで常駐する。コンテナ・ボリュームを誤って消してもデータが残る備え | 本番（自動） |
| `restore_test.sh` | バックアップを使い捨てDBに復元して検証。cron 用 | 本番 |
| `inspect_prod.sh` | 本番の backend の**実際の構成**（`--reload`・bind mount・`.venv` の匿名ボリューム・httpx などの有無・旧形式の画像・PostgreSQL のバージョン）を確認する。**読み取り専用** | 本番 |
| `schema_diff.sh` | 本番DBのスキーマが `db/init` と一致するか確認（読み取りのみ） | 本番 |
| `setup_tutor_secrets.sh` | tutor の共有シークレットと専用 DB ロールの作成 | 本番（初回） |
| `migrate_legacy_images.sh` | 旧形式の画像（`./static/images/...`）をホストから uploads ボリュームへコピー（上書きしない・何度実行しても安全）。`deploy.sh` が自動で実行する | 本番 |
| `seed_users.sh` | 初期ユーザーの投入 | 開発 / 初回のみ |
| `reset.sh` / `reset.bat` | **全データ削除**して作り直す（`DELETE` の入力が必要） | **開発のみ** |
| `deploy_new_db_volume.sh` | **空の新DBボリュームで**起動する（`DELETE` の入力が必要） | 通常使わない |
| `_guard.sh` | 破壊的スクリプトの確認ヘルパ（直接実行しない） | — |
| `tests/` | 安全装置のテスト。`run_all.sh`（全部）/ `--no-heavy`（イメージのビルドを除く）/ `--fast`（docker 不要）。偽の docker を使うもの、本物の docker / nginx / PostgreSQL を使うもの、スタック全体を起動する通しの検証（`e2e_stack.sh`）がある。CI で実行 | 開発 / CI |

手順は [docs/ops/](../docs/ops/) を参照。
