"""chat-eval 전사(*.run.json)에서 동반자 답마다 라벨 후보 한 줄을 만든다.

greeting 은 user_turns 가 빈 줄(#0), turns[i].answer 는 직전 사용자 말 최대 2개를 담은 줄(#index).
같은 답 본문이 여러 전사에 있으면 경로 순으로 처음 것 하나만 남긴다.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from decision.candidates import merge
from decision.schema import make_row


def run_files(material_dir: Path) -> list[Path]:
    return sorted(material_dir.rglob("*.run.json"))


def rows_from_run(run: dict[str, Any], run_id: str) -> Iterator[dict[str, Any]]:
    persona = run["persona"]["name"]
    greeting = run.get("greeting")
    if isinstance(greeting, str) and greeting.strip():
        yield make_row(f"{run_id}#0", persona, [], greeting)
    users: list[str] = []
    for position, turn in enumerate(run.get("turns", []), start=1):
        user = turn.get("user")
        if isinstance(user, str) and user.strip():
            users.append(user)
        answer = turn.get("answer")
        if isinstance(answer, str) and answer.strip():
            index = turn.get("index", position)
            yield make_row(f"{run_id}#{index}", persona, users[-2:], answer)


def extract_candidates(material_dir: Path) -> list[dict[str, Any]]:
    groups = []
    for path in run_files(material_dir):
        run = json.loads(path.read_text(encoding="utf-8"))
        relative = path.relative_to(material_dir)
        run_id = (relative.parent / run["persona"]["name"]).as_posix()
        groups.append(list(rows_from_run(run, run_id)))
    return merge(*groups)
