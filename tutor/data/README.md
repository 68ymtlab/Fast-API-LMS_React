# tutor/data

チューターの知識ベース（教科書「線形代数」から作ったもの）。**git で管理している**（研究室のリポジトリ）。
デプロイ先では `git pull` するだけで揃う。コンテナには `docker-compose` で読み取り専用でマウントされる。

```
data/
└── stage4/
    ├── embeddings.json        # 672 エンティティ + bge-m3 dense + BM25 コーパス（約21MB）
    ├── knowledge_graph.json   # 依存関係 KG（約1MB）
    ├── qdrant_data/           # Qdrant ローカルストア（約8MB。読むだけでは書き換わらない。.lock は git 管理外）
    └── SYNC_INFO.txt          # 同期元・ハッシュ
```

- `qdrant_data/` が無い・空でも、チューターは起動し、メモリ上の dense / BM25 検索に切り替わる（`_open_qdrant`）。
- 更新: 研究側（`agents/workspace/rag/textbooks/linear-algebra/stage4_qdrant/` が正）で知識ベースを更新したら、
  `./tutor/scripts/sync_from_agents.sh` で取り込み、**コミットして push**、本番で `git pull` → `./scripts/deploy.sh`。
  （過去の会話は壊れない。新しい `kb_version` として記録される）
- ファイルを大きくしすぎない（GitHub は 50MB で警告、100MB でエラー。今は最大 21MB）。
