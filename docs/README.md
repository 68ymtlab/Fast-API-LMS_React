# ドキュメント

## 運用（本番サーバー）— [ops/](ops/)

| 文書 | 内容 |
|---|---|
| [deploy-checklist.md](ops/deploy-checklist.md) | **最初に読む。** 最新版を本番に出すときに人がやることを、順番に並べたチェックリスト |
| [runbook-deploy.md](ops/runbook-deploy.md) | デプロイの手順・ロールバック・トラブルシュート |
| [backup-restore.md](ops/backup-restore.md) | バックアップ（定期・別マシン保管）・復元・復元テスト |
| [runbook-secret-rotation.md](ops/runbook-secret-rotation.md) | `SECRET_KEY` などのシークレット更新 |
| [docker-network.md](ops/docker-network.md) | 教室 Wi-Fi と Docker ネットワークの衝突回避 |

## AI チューター — [ai-tutor/](ai-tutor/)

| 文書 | 内容 |
|---|---|
| [ai-tutor-handover.md](ai-tutor/ai-tutor-handover.md) | 本番投入と運用で人がやること（知識ベース同期・シークレット・定期作業） |
| [ai-tutor.md](ai-tutor/ai-tutor.md) | LMS に移植した配置の考察と計画 |
| [ai-tutor-data.md](ai-tutor/ai-tutor-data.md) | 会話の永続化・引き継ぎ・質問収集のデータ設計 |
| [ai-tutor-roadmap-and-problem-authoring.md](ai-tutor/ai-tutor-roadmap-and-problem-authoring.md) | 今後の方向性と演習問題の作成方法の考察 |
| [tutor-system-diagrams.html](ai-tutor/tutor-system-diagrams.html) | システム構成図（ブラウザで開く） |
| llm-server-settings.xlsx | LLM サーバーの設定メモ |

スクリプトの一覧は [scripts/README.md](../scripts/README.md)。
