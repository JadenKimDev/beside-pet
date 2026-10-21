"""판정기 인터페이스. 판정기는 라벨 JSONL 한 줄(dict)을 받아 Judgment 를 돌려준다.

    Judgment = {"choice": str | None, "probabilities": dict[str, float] | None, "latency_ms": int}

choice 가 None 이면 답을 얻지 못한 것이다(오류는 "error" 칸에 짧게 남긴다). probabilities 는 확률을 주는
판정기(laya, systemone)만 채운다. 판정기는 줄의 질문(questions.kind 의 instructions, criteria)을 그 줄에 적힌
차례대로 묻는다. 그래서 평가가 criteria 의 차례만 바꾼 줄을 넘겨 옵션 순서 민감도를 잰다. 줄의 label 은 보지 않는다.

구현: claude(claude -p, 확률 없음), laya(laya.load, 지연 import), systemone(HTTP /v1/systemone).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, NotRequired, TypedDict

from decision.schema import QUESTION_ID


class Judgment(TypedDict):
    choice: str | None
    probabilities: dict[str, float] | None
    latency_ms: int
    error: NotRequired[str]


class JudgeUnavailable(RuntimeError):
    """판정기를 쓸 수 없어 건너뛴다(예: SYSTEMONE_URL 이 없다)."""


class Judge:
    name: str = ""
    model: str = ""

    def judge(self, row: dict[str, Any]) -> Judgment:
        raise NotImplementedError

    def judge_many(self, rows: Sequence[dict[str, Any]]) -> list[Judgment]:
        """차례를 지켜 돌려준다. 한 줄의 실패는 그 자리에 choice None 과 error 로 남긴다."""
        out: list[Judgment] = []
        for row in rows:
            try:
                out.append(self.judge(row))
            except Exception as error:  # noqa: BLE001 - 한 줄의 실패가 평가 전체를 멈추지 않게 한다
                out.append(failed(error))
        return out


def failed(error: BaseException) -> Judgment:
    return {"choice": None, "probabilities": None, "latency_ms": 0, "error": str(error)[:300]}


def question_of(row: dict[str, Any]) -> dict[str, Any]:
    """판정기에 넘기는 질문. label 은 빼고 criteria 는 줄의 차례 그대로."""
    q = row["questions"][QUESTION_ID]
    return {"type": "choice", "instructions": q["instructions"], "criteria": dict(q["criteria"])}


def make_judge(name: str, model: str, **options: Any) -> Judge:
    if name == "claude":
        from decision.judges.claude import ClaudeJudge

        return ClaudeJudge(model=model, **options)
    if name == "laya":
        from decision.judges.laya import LayaJudge

        return LayaJudge(model=model, **options)
    if name == "systemone":
        from decision.judges.systemone import SystemoneJudge

        return SystemoneJudge.from_env(model=model, **options)
    raise ValueError(f"모르는 판정기: {name}")


JUDGES: tuple[str, ...] = ("claude", "laya", "systemone")
DEFAULT_MODELS: dict[str, str] = {"claude": "haiku", "laya": "2nugu/laya-ko", "systemone": ""}
