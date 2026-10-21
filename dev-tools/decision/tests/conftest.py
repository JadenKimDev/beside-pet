import json
from pathlib import Path

import pytest


def _run(persona: str, greeting: str, turns: list[tuple[str, str]]) -> dict:
    return {
        "persona": {"name": persona, "situation": "지어낸 인물"},
        "greeting": greeting,
        "turns": [{"index": i, "user": u, "answer": a} for i, (u, a) in enumerate(turns, start=1)],
    }


@pytest.fixture
def material(tmp_path: Path) -> Path:
    root = tmp_path / "chat-eval"
    (root / "2026-01-01").mkdir(parents=True)
    (root / "model-x" / "2026-01-02").mkdir(parents=True)
    first = _run(
        "fake-dog",
        "안녕하세요, 곁에 있을게요.",
        [("콩이가 산책을 좋아했어요.", "콩이가 산책을 좋아했군요."), ("비 오는 날에도요.", "비 오는 날 어디로 걸었나요?"),
         ("공원이요.", "공원에서의 콩이를 떠올리시는군요.")],
    )
    second = _run("fake-bird", "안녕하세요, 곁에 있을게요.", [("짹짹이는 노래를 했어요.", "어떤 노래였나요?")])
    (root / "2026-01-01" / "fake-dog.run.json").write_text(json.dumps(first, ensure_ascii=False), encoding="utf-8")
    (root / "model-x" / "2026-01-02" / "fake-bird.run.json").write_text(
        json.dumps(second, ensure_ascii=False), encoding="utf-8"
    )
    (root / "2026-01-01" / "fake-dog.md").write_text("전사 아님", encoding="utf-8")
    return root
