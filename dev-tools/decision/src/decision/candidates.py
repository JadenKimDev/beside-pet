"""후보 파일(data/candidates.jsonl) 합치기: chat-eval 출처를 먼저, 합성을 뒤에 두고 같은 답 본문은 한 번만."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from typing import Any

from decision.jsonl import read_jsonl


def merge(*groups: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_replies: set[str] = set()
    seen_ids: set[str] = set()
    for group in groups:
        for row in group:
            reply = row["state"]["reply"]
            if reply in seen_replies or row["id"] in seen_ids:
                continue
            seen_replies.add(reply)
            seen_ids.add(row["id"])
            rows.append(row)
    return rows


def existing(path: Path, source: str) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    return [row for row in read_jsonl(path) if row.get("source") == source]
