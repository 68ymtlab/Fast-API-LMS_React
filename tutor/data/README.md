# tutor/data

実行時データの置き場（git 管理外）。

```
data/
└── stage4/
    ├── embeddings.json        # 672 エンティティ + bge-m3 dense + BM25 コーパス（約21MB）
    ├── knowledge_graph.json   # 依存関係 KG（約1MB）
    ├── qdrant_data/           # Qdrant ローカルストア（無くても in-memory dense にフォールバック）
    └── SYNC_INFO.txt          # 同期元・ハッシュ
```

取り込み: `./tutor/scripts/sync_from_agents.sh`（研究側 `agents/workspace/rag/textbooks/linear-algebra/stage4_qdrant/` が正）。
