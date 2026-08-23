#!/usr/bin/env python3
"""Thin agent helpers for winner_v1 retrieval."""

from __future__ import annotations

import re

ENT_RE = re.compile(r"ent_\d+")


def extract_mentioned_entity_ids(query: str, valid_ids: set[str] | None = None) -> list[str]:
    """Return unique ent_N ids appearing in the query text."""
    out: list[str] = []
    for eid in ENT_RE.findall(query or ""):
        if valid_ids is not None and eid not in valid_ids:
            continue
        if eid not in out:
            out.append(eid)
    return out


def pin_mentions(ordered_ids: list[str], mentions: list[str], final_k: int) -> list[str]:
    """Ensure mentioned IDs appear first in the final top-k (stable)."""
    out: list[str] = []
    for eid in mentions:
        if eid not in out:
            out.append(eid)
    for eid in ordered_ids:
        if eid not in out:
            out.append(eid)
        if len(out) >= final_k:
            break
    return out[:final_k]


def merge_mentions_into_candidates(
    candidate_ids: list[str], mentions: list[str]
) -> list[str]:
    """Put mentions at front of candidate pool before rerank."""
    out: list[str] = []
    for eid in mentions:
        if eid not in out:
            out.append(eid)
    for eid in candidate_ids:
        if eid not in out:
            out.append(eid)
    return out
