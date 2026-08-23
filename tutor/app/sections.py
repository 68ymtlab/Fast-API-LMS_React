"""LMS の教科書ページ → 研究側 KG の節（entity の section）の対応付け。

LMS のページタイトル（例: 「単位行列」「行列の積」「2.1 関数」）と、KG の節名
（例: 「## 単位行列（identity matrices）」「## 2.1 行列とその演算」）を正規化して前方一致／包含で突き合わせる。
対応表は起動時に KG から作り、必要ならテーブル tutor.settings の page_section_overrides（{lesson_page_id: section}）で上書きできる。
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

_PAREN = re.compile(r"[（(][^）)]*[）)]")
_NUM = re.compile(r"^[\d\.\s　]+")
_COL = re.compile(r"^コラム[①-⑩0-9]*[\s　:：]*")


def normalize(title: str) -> str:
    t = unicodedata.normalize("NFKC", title or "")
    t = t.lstrip("# ").strip()
    t = _PAREN.sub("", t)        # 英語併記を外す
    t = _COL.sub("", t)
    t = _NUM.sub("", t)          # 章番号を外す
    t = re.sub(r"[\s　・,，、．.]", "", t)
    return t.lower()


class SectionMatcher:
    def __init__(self, sections: list[str], entities: dict[str, dict[str, Any]] | None = None):
        self.sections = list(dict.fromkeys(s for s in sections if s))
        self._norm = {s: normalize(s) for s in self.sections}
        self.overrides: dict[str, str] = {}
        # 節名に無い語（「単位行列」「ゼロ行列」など、KG では大きな節の中の定義）は、エンティティ本文で多数決する
        self._ent_texts: list[tuple[str, str, str]] = []   # (section, type, text)
        self._sec_size: dict[str, int] = {}
        for e in (entities or {}).values():
            sec = e.get("section") or ""
            txt = unicodedata.normalize("NFKC", str(e.get("text_for_search") or e.get("content") or "")).lower()
            if sec and txt:
                self._ent_texts.append((sec, str(e.get("type") or ""), txt))
                self._sec_size[sec] = self._sec_size.get(sec, 0) + 1

    NONE = "-"   # 上書きで「対応なし」を表す値

    def set_overrides(self, ov: dict[str, Any] | None) -> None:
        self.overrides = {str(k): str(v) for k, v in (ov or {}).items() if v}

    def match(self, page_title: str | None, lesson_page_id: int | None = None) -> str | None:
        if lesson_page_id is not None and str(lesson_page_id) in self.overrides:
            v = self.overrides[str(lesson_page_id)]
            return None if v == self.NONE else v
        q = normalize(page_title or "")
        if len(q) < 2:
            return None
        exact = [s for s, n in self._norm.items() if n == q]
        if exact:
            return exact[0]
        # 節名の前方一致（3 文字以上）。「行列」のような短い語で「行列式…」に誤対応しないよう、包含一致は使わない
        if len(q) >= 3:
            pref = [s for s, n in self._norm.items() if n.startswith(q) or q.startswith(n)]
            if pref:
                return sorted(pref, key=lambda s: abs(len(self._norm[s]) - len(q)))[0]
        # エンティティ本文での多数決（節名に無い下位概念用）。2 件以上ヒットした節のうち最多
        raw = unicodedata.normalize("NFKC", (page_title or "")).strip().lower()
        raw = _PAREN.sub("", raw).strip()
        if len(raw) >= 2:
            # 語を「定義している」エンティティ（説明文の末尾や「（語）」「語という」）を最重視し、
            # 次に定義での言及、最後に一般の言及。節のサイズで正規化
            defines_re = re.compile(rf"(?:{re.escape(raw)}[）)]*\s*$|[（(]{re.escape(raw)}[）)]|{re.escape(raw)}(?:という|とよぶ|と呼ぶ|といい|とは))")
            hits: dict[str, int] = {}
            def_hits: dict[str, int] = {}
            defines: dict[str, int] = {}
            for sec, typ, txt in self._ent_texts:
                if raw not in txt:
                    continue
                hits[sec] = hits.get(sec, 0) + 1
                if typ == "definition":
                    def_hits[sec] = def_hits.get(sec, 0) + 1
                    if defines_re.search(txt):
                        defines[sec] = defines.get(sec, 0) + 1
            if defines:
                # その語を定義している節があれば、その中から（定義数 → 定義での言及 → 言及数）
                return max(defines, key=lambda sec: (defines[sec], def_hits.get(sec, 0), hits.get(sec, 0)))
            if hits and max(hits.values()) >= 3:
                # 定義が無い語（「行列の積」など）は、言及の多い節（定義での言及を重めに）
                return max(hits, key=lambda sec: hits[sec] + 2 * def_hits.get(sec, 0))
        return None

    def table(self, pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """対応表（教員ビュー用）。pages: [{lesson_page_id, title}]"""
        return [{"lesson_page_id": p.get("lesson_page_id"), "title": p.get("title"),
                 "section": self.match(p.get("title"), p.get("lesson_page_id")),
                 "overridden": str(p.get("lesson_page_id")) in self.overrides} for p in pages]
