"""Select only request-relevant, privacy-minimized observed exercise evidence."""
from __future__ import annotations

import re
from typing import Any


_STOP_TERMS = {
    "説明", "教えて", "見せて", "分から", "わから", "これ", "それ", "ここ", "問題",
    "質問", "意味", "定義", "例", "なぜ", "どうして", "ください", "について", "とは",
    "何", "次", "どこ", "全然", "全く", "この", "その", "式", "ページ", "別件",
}
_PAGE_REFERENCE_RE = re.compile(r"この|これ|ここ|それ|この式|ページ|上の|下の|さっき|もう少し|詳しく|分からない|わからない")
_UNRELATED_RE = re.compile(r"別件|別の話|話は変わ|ところで|関係ないけど")


def _terms(text: Any) -> list[str]:
    value = str(text or "")
    pieces = re.findall(r"[一-龥々]{2,}|[ァ-ヶー]{2,}|[A-Za-z][A-Za-z0-9_+-]{1,}|\d+[A-Za-z]+", value)
    out: list[str] = []
    for piece in pieces:
        term = piece.strip()
        if len(term) < 2 or term in _STOP_TERMS or any(term.startswith(stop) for stop in _STOP_TERMS if len(stop) >= 3):
            continue
        # Keep the complete phrase and useful long Japanese sub-concepts. This
        # remains lexical and deterministic; no student answer text is needed.
        values = [term]
        if len(term) >= 5 and re.fullmatch(r"[一-龥々]+", term):
            values.extend(term[i:i + 4] for i in range(len(term) - 3))
        for value in values:
            if value not in out and value not in _STOP_TERMS:
                out.append(value)
    return out


def _normalized(value: Any) -> str:
    return re.sub(r"[\W_]+", "", str(value or "").lower(), flags=re.UNICODE)


def _matches(text: str, terms: list[str]) -> bool:
    haystack = _normalized(text)
    return any(len(_normalized(term)) >= 2 and _normalized(term) in haystack for term in terms)


def _label_matches_query(label: str, query: str, terms: list[str]) -> bool:
    if _matches(label, terms):
        return True
    query_text = _normalized(query)
    return any(
        len(_normalized(term)) >= 2 and _normalized(term) in query_text
        for term in _terms(label)
    )


def select_relevant_learner_evidence(
    evidence: list[dict[str, Any]] | None,
    *,
    query: str,
    page_context: dict[str, Any] | None,
    searcher: Any,
    limit: int = 8,
) -> dict[str, Any]:
    """Rank direct and KG-prerequisite evidence; drop unrelated recent records.

    The caller supplies authorized, bounded backend candidates. This function
    never sees raw exercise answers and never expands a learner-provided ID.
    """
    direct_terms = _terms(query)
    page = page_context or {}
    page_terms = _terms(page.get("title")) + _terms(page.get("section"))
    page_is_relevant = bool(
        page_terms
        and not _UNRELATED_RE.search(str(query or ""))
        and (
            _PAGE_REFERENCE_RE.search(str(query or ""))
            or any(term in page_terms for term in direct_terms)
        )
    )
    if page_is_relevant:
        for term in page_terms:
            if term not in direct_terms:
                direct_terms.append(term)

    graph = getattr(searcher, "graph", None)
    nodes = getattr(graph, "nodes", {}) or {}
    entities = getattr(searcher, "entities", {}) or {}
    prerequisite_terms: list[str] = []
    matched_entity_ids: set[str] = set()
    for entity_id, entity in entities.items():
        label = f"{entity.get('title', '')} {entity.get('section', '')}"
        if _label_matches_query(label, query, direct_terms):
            matched_entity_ids.add(str(entity_id))
    # Some lightweight searchers only expose graph nodes.
    for entity_id, node in nodes.items():
        label = f"{node.get('title', '')} {node.get('section', '')}"
        if _label_matches_query(label, query, direct_terms):
            matched_entity_ids.add(str(entity_id))
    if graph is not None and hasattr(graph, "get_dependencies"):
        for entity_id in matched_entity_ids:
            try:
                dependencies = graph.get_dependencies(entity_id, max_depth=1, include_cross=False)
            except Exception:
                dependencies = []
            for dependency in dependencies or []:
                title = str(dependency.get("title") or "")
                section = str(dependency.get("section") or "")
                for term in _terms(f"{title} {section}"):
                    if term not in prerequisite_terms and not _matches(term, direct_terms):
                        prerequisite_terms.append(term)

    chosen: list[tuple[int, int, dict[str, Any]]] = []
    candidates = evidence or []
    for index, raw in enumerate(candidates):
        if not isinstance(raw, dict):
            continue
        labels = " ".join([
            str(raw.get("item_title") or ""),
            " ".join(str(tag) for tag in (raw.get("topic_tags") or [])),
        ])
        relation = ""
        rank = 99
        if _label_matches_query(labels, query, direct_terms):
            relation, rank = "direct_concept", 0
        elif prerequisite_terms and _matches(labels, prerequisite_terms):
            relation, rank = "prerequisite_concept", 1
        if not relation:
            continue
        item = dict(raw)
        item["relation_to_query"] = relation
        item["attempt_count"] = min(50, max(1, int(item.get("attempt_count") or 1)))
        outcomes = item.get("recent_outcomes")
        if not isinstance(outcomes, list) or not outcomes:
            outcomes = [item.get("result", "unknown")]
        item["recent_outcomes"] = [str(value) for value in outcomes[:6]]
        chosen.append((rank, index, item))

    chosen.sort(key=lambda record: (record[0], record[1]))
    selected = [entry[2] for entry in chosen[:max(0, limit)]]
    selected_refs = {str(item.get("ref")) for item in selected}
    return {
        "selected": selected,
        "candidate_count": len(candidates),
        "selected_count": len(selected),
        "rejected_count": max(0, len(candidates) - len(selected_refs)),
        "direct_count": sum(item.get("relation_to_query") == "direct_concept" for item in selected),
        "prerequisite_count": sum(item.get("relation_to_query") == "prerequisite_concept" for item in selected),
    }
