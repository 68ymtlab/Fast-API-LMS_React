#!/usr/bin/env python3
"""発話から学習者の理解度を推定する（受動推定・逐次更新可能）。

背景（監査 S4）:
  現行チュータは理解度を **自己申告の MCQ で1回** 決めるだけで、以後更新しない。
  2つ目以降の概念では診断が走らず、初回に「初めて聞いた」と答えた学習者は
  以降どの話題でも none 固定になる。客観シグナル（学習者の産出）を一切見ていない。

本モジュールは、学習者の発話（質問・言い直し・自由記述）から理解度を
ルーブリックで推定する。MCQ の代替 or 併用として使え、毎ターン更新できる。

ルーブリック（順序尺度）:
  none        「〜って何」レベル。専門用語をほぼ使わない。意味・イメージを求める
  heard       用語は知っているが定義があいまい。定義の確認・言い換えを求める
  can_compute 計算・手順・式を使える。応用・使い方・具体例を問う
  can_prove   「なぜ成り立つか」を問う。証明・一般化・反例・条件・概念間の接続に言及

出力は順序尺度なので、評価では厳密一致だけでなく **順序距離（MAE）** も見る。

Usage（ライブラリとして）:
  from learner_model import estimate_level, LEVELS
  est = estimate_level(client, dialogue, topic="固有値")
  # est = {"level": "can_prove", "level_idx": 3, "goal": "proof",
  #        "confidence": 0.8, "evidence": "...", "signals": {...}}
"""
from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from deeprag_search import (  # noqa: E402
    LLM_EXTRA_BODY,
    LLM_MODEL,
    _strip_thinking_process,
)

LEVELS = ["none", "heard", "can_compute", "can_prove"]
LEVEL_IDX = {lv: i for i, lv in enumerate(LEVELS)}
GOALS = ["intuition", "definition", "application", "proof", "generalization", "unknown"]

RUBRIC_SYSTEM = """あなたは数学教育の診断アシスタントです。
学習者の発話（線形代数に関する質問や返答）から、その学習者の理解度を
次の4段階の順序尺度で推定してください。自己申告ではなく**発話の中身**から判断します。

- none        : 「〜って何」レベル。専門用語をほぼ使わない。意味・イメージだけを求める
- heard       : 用語は知っているが定義があいまい。定義の確認・言い換え・具体例を求める
- can_compute : 計算・手順・式を扱える。応用・使い方・別の計算との関係を問う
- can_prove   : 「なぜ成り立つか」を問う。証明・一般化・反例・成立条件・概念間の接続に踏み込む

判定の手がかり（signals）も併せて評価してください:
- vocabulary : 専門用語の精度（0=素朴, 1=一部, 2=正確に多用）
- asks_why   : 「なぜ/証明/一般に」を問うているか（true/false）
- computation: 計算・手順への言及があるか（true/false）
- references_other_concepts: 他の概念との関係に触れているか（true/false）

目的（goal）も推定: intuition / definition / application / proof / generalization。

思考プロセスは出さず、JSON のみ:
{"level": "heard", "goal": "definition", "confidence": 0.0-1.0,
 "signals": {"vocabulary": 0, "asks_why": false, "computation": false, "references_other_concepts": false},
 "evidence": "根拠となった発話の特徴を一言"}"""


def _extract_json(text: str) -> dict[str, Any]:
    text = _strip_thinking_process(text or "")
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return {}
    blob = m.group(0)
    for attempt in (blob, re.sub(r'\\(?![\\"/bfnrtu])', r"\\\\", blob)):
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    return {}


def estimate_level(
    client,
    dialogue: list[dict[str, str]] | list[str],
    topic: str = "",
    prior_level: str | None = None,
) -> dict[str, Any]:
    """発話列から理解度を推定する。

    dialogue: [{"role","content"}] か、生の発話文字列のリスト。
    prior_level: 直前までの推定（あれば安定化のヒントに使う。無くても可）。
    """
    # 学習者発話だけを抜き出す
    utterances: list[str] = []
    for turn in dialogue or []:
        if isinstance(turn, str):
            utterances.append(turn)
        elif isinstance(turn, dict):
            if turn.get("role") in (None, "user", "student", "learner"):
                c = (turn.get("content") or "").strip()
                if c and not c.startswith("[診断]") and not c.startswith("[clarify]"):
                    utterances.append(c)
    utterances = [u for u in utterances if u][-8:]
    if not utterances:
        return {"level": prior_level or "unknown", "level_idx": LEVEL_IDX.get(prior_level or "", -1),
                "goal": "unknown", "confidence": 0.0, "signals": {}, "evidence": "no_utterance"}

    user = "## 話題\n" + (topic or "(不明)") + "\n\n## 学習者の発話（新しいものほど下）\n"
    user += "\n".join(f"- {u}" for u in utterances)
    if prior_level and prior_level != "unknown":
        user += f"\n\n## 参考: 直前までの推定は {prior_level}。大きく変わるなら根拠を evidence に。"

    import time

    data: dict[str, Any] = {}
    last = None
    for attempt in range(4):
        try:
            stream = client.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": RUBRIC_SYSTEM},
                    {"role": "user", "content": user},
                ],
                temperature=0.0,
                max_tokens=300,
                stream=True,
                extra_body=LLM_EXTRA_BODY,
            )
            parts = []
            for chunk in stream:
                if not chunk.choices:
                    continue
                d = chunk.choices[0].delta
                if d and d.content:
                    parts.append(d.content)
            data = _extract_json("".join(parts))
            break
        except Exception as exc:  # noqa: BLE001  (503 等の一過性障害に耐える)
            last = exc
            time.sleep(min(20, 3 * (attempt + 1)))
    else:
        return {"level": prior_level or "unknown", "level_idx": -1, "goal": "unknown",
                "confidence": 0.0, "signals": {}, "evidence": f"error:{last}"}

    level = str(data.get("level", "")).strip()
    if level not in LEVELS:
        level = prior_level or "heard"
    goal = str(data.get("goal", "unknown")).strip()
    if goal not in GOALS:
        goal = "unknown"
    try:
        conf = float(data.get("confidence", 0.0))
    except (TypeError, ValueError):
        conf = 0.0
    return {
        "level": level,
        "level_idx": LEVEL_IDX[level],
        "goal": goal,
        "confidence": max(0.0, min(1.0, conf)),
        "signals": data.get("signals") or {},
        "evidence": str(data.get("evidence", ""))[:200],
    }


def fuse_estimate(
    prior: str | None,
    new: dict[str, Any],
    min_confidence: float = 0.5,
) -> str:
    """逐次更新: 新推定の確信度が閾値以上なら採用。順序尺度で1段ずつ動かす安定化。

    大きな飛躍（none→can_prove）は1ターンでは1段に留め、証拠が続けば追従する。
    """
    if not prior or prior == "unknown":
        return new["level"]
    if new.get("confidence", 0.0) < min_confidence:
        return prior
    pi, ni = LEVEL_IDX.get(prior, 1), new.get("level_idx", 1)
    if ni == pi:
        return prior
    step = 1 if ni > pi else -1
    return LEVELS[pi + step]
