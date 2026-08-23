#!/usr/bin/env python3
"""型付き図スペック（VizSpec）のルール生成。LLMに自由描画させない。"""
from __future__ import annotations

from typing import Any


def plan_viz(
    focus_concept: str,
    *,
    goal: str = "unknown",
    turn_class: str = "",
    explain_mode: str = "first",
) -> dict[str, Any] | None:
    """焦点概念から VizSpec を返す。不明なら None。"""
    fc = (focus_concept or "").lower()
    raw = focus_concept or ""

    # 内積
    if any(k in raw for k in ("内積", "inner product", "ドット積")):
        return {
            "kind": "inner_product",
            "params": {
                "a": {"x": 120, "y": -40, "label": "a"},
                "b": {"x": 80, "y": -90, "label": "b"},
                "show_projection": True,
            },
            "caption": "内積は、一方の矢印をもう一方の向きに「影」として落とした長さに関係します。",
        }

    # 固有値: 伸び縮みのイメージ（行列変形の簡易版）
    if any(k in raw for k in ("固有値", "固有ベクトル", "eigen")):
        return {
            "kind": "matrix_transform2d",
            "params": {
                "matrix": [[2.0, 0.0], [0.0, 0.5]],
                "show_grid": True,
            },
            "caption": "固有値は、ある向きの矢印が向きを変えずに何倍に伸び縮みするか、という倍率です。",
        }

    # 行列の変形（導入の直感）
    if any(k in raw for k in ("行列", "線形変換", "1次変換")) and goal in (
        "intuition",
        "application",
        "unknown",
    ):
        if "式" in raw and "変形" not in raw and turn_class == "new_topic":
            pass
        else:
            return {
                "kind": "matrix_transform2d",
                "params": {
                    "matrix": [[1.2, 0.3], [0.2, 0.9]],
                    "show_grid": True,
                },
                "caption": "行列は、平面上の矢印（や格子）をまとめて変形するルール表、とイメージできます。",
            }

    # ベクトル（既定・導入）
    if any(k in raw for k in ("ベクトル", "vector", "矢印")) or (
        explain_mode in ("simplify", "after_clarify") and "ベクトル" in raw
    ):
        return {
            "kind": "vector2d",
            "params": {
                "vectors": [
                    {"x": 100, "y": -60, "label": "v", "color": "#4f8cff"},
                ],
                "show_axes": True,
            },
            "caption": "ベクトルは、向きと大きさを持つ矢印だと思ってください。",
        }

    # focus が空でも simplify で矢印確認のとき
    if turn_class in ("confused", "followup") and any(
        k in fc for k in ("vector",)
    ):
        return {
            "kind": "vector2d",
            "params": {
                "vectors": [
                    {"x": 100, "y": -60, "label": "v", "color": "#4f8cff"},
                ],
                "show_axes": True,
            },
            "caption": "矢印＝向き＋大きさ、がベクトルのイメージです。",
        }

    return None
