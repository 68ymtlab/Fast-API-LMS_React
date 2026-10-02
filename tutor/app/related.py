"""既存の演習問題（教員作成）を、いまの話題に近い順に並べる。

方針（研究側の決定を踏襲）: LLM に問題を生成させない。LMS の questions テーブルにある問題を
bge-m3 の埋め込み（検索と同じモデル・同じ API）でランキングするだけ。
候補の埋め込みはテキストのハッシュでメモリにキャッシュする（問題数は多くても数千件想定）。
"""
from __future__ import annotations

import hashlib
import threading
from typing import Any

import numpy as np

from deeprag_search import EMBED_TIMEOUT_SEC, LLM_API_KEY, LLM_BASE_URL, _http_json_post

_cache: dict[str, np.ndarray] = {}
_lock = threading.Lock()


def _key(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _embed_batch(model_id: str, texts: list[str]) -> list[np.ndarray]:
    data = _http_json_post(
        f"{LLM_BASE_URL.rstrip('/')}/v1/embeddings",
        {"model": model_id, "input": texts, "encoding_format": "float"},
        headers={"Authorization": f"Bearer {LLM_API_KEY}"},
        timeout=EMBED_TIMEOUT_SEC,
    )
    out = []
    for item in sorted(data["data"], key=lambda d: d.get("index", 0)):
        v = np.asarray(item["embedding"], dtype=np.float32)
        n = float(np.linalg.norm(v))
        out.append(v / n if n > 0 else v)
    return out


def embed_texts(model_id: str, texts: list[str]) -> list[np.ndarray]:
    """キャッシュ込みの埋め込み。未計算分だけまとめて API に投げる。"""
    keys = [_key(t) for t in texts]
    with _lock:
        missing = [(k, t) for k, t in zip(keys, texts) if k not in _cache]
    for i in range(0, len(missing), 32):
        chunk = missing[i : i + 32]
        vecs = _embed_batch(model_id, [t for _, t in chunk])
        with _lock:
            for (k, _), v in zip(chunk, vecs):
                _cache[k] = v
    with _lock:
        return [_cache[k] for k in keys]


def rank(model_id: str, query: str, candidates: list[dict[str, Any]], top_k: int = 3, min_score: float = 0.0) -> list[dict[str, Any]]:
    """candidates: [{"id": ..., "text": ...}] → [{"id", "score"}] を類似度の高い順に。"""
    if not query.strip() or not candidates:
        return []
    texts = [str(c.get("text") or "") for c in candidates]
    vecs = embed_texts(model_id, [query] + texts)
    q, cs = vecs[0], np.stack(vecs[1:])
    scores = cs @ q
    order = np.argsort(-scores)
    out = []
    for i in order[:top_k]:
        s = float(scores[i])
        if s < min_score:
            continue
        out.append({"id": candidates[i].get("id"), "score": round(s, 4)})
    return out
