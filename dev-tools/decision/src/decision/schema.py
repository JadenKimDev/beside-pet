"""라벨 JSONL 의 형식과 판정 질문 문구. 질문 문자열은 여기 한 곳에만 둔다.

한 줄 = {"id", "persona", "source", "state": {"user_turns": [...], "reply": "..."},
         "questions": {"kind": {"type": "choice", "instructions", "criteria", "label"}}}
Laya, Kev, systemone, claude 판정기가 모두 이 한 형식을 읽는다. 모르는 칸(persona, source)은 그쪽이 무시한다.
"""

from __future__ import annotations

from typing import Any

QUESTION_ID = "kind"

SOURCES: tuple[str, ...] = ("chat-eval", "synthetic-haiku")

LABELS: tuple[str, ...] = ("generic_comfort", "specific_reflection", "question", "crisis_fixed")

# Laya 관례: instructions 에서 상태의 키를 백틱으로 가리킨다.
INSTRUCTIONS = "`reply` 는 반려동물을 떠나보낸 보호자에게 동반자가 한 답이고, `user_turns` 는 그 직전 보호자의 말이다. `reply` 의 주된 성격은 무엇인가?"

CRITERIA: dict[str, str] = {
    "generic_comfort": "보호자가 말한 구체 없이 누구에게나 통하는 일반적인 위로나 안심을 주로 건넴",
    "specific_reflection": "보호자가 말한 구체적인 사실, 이름, 기억, 감정을 되받아 말하는 것이 주됨",
    "question": "보호자에게 묻는 것이 답의 주된 부분임",
    "crisis_fixed": "자해나 자살 위기를 알아차리고 도움받을 곳을 안내하는 고정 문구",
}


def kind_question(label: str | None = None) -> dict[str, Any]:
    """모든 줄에 같은 문자열로 들어가는 판정 질문."""
    question: dict[str, Any] = {
        "type": "choice",
        "instructions": INSTRUCTIONS,
        "criteria": dict(CRITERIA),
    }
    if label is not None:
        question["label"] = label
    return question


def make_row(
    row_id: str, persona: str, user_turns: list[str], reply: str, source: str = "chat-eval"
) -> dict[str, Any]:
    return {
        "id": row_id,
        "persona": persona,
        "source": source,
        "state": {"user_turns": list(user_turns), "reply": reply},
        "questions": {QUESTION_ID: kind_question()},
    }


def row_errors(row: Any, *, labeled: bool) -> list[str]:
    """한 줄의 형식 오류. 비면 통과다. labeled 면 label 이 있어야 한다."""
    if not isinstance(row, dict):
        return ["줄이 객체가 아니다"]
    errors: list[str] = []
    if not isinstance(row.get("id"), str) or not row["id"]:
        errors.append("id 가 비었거나 문자열이 아니다")
    if "persona" in row and not isinstance(row["persona"], str):
        errors.append("persona 가 문자열이 아니다")
    if row.get("source") not in SOURCES:
        errors.append(f"source 가 {', '.join(SOURCES)} 가 아니다")
    errors += _state_errors(row.get("state"))
    errors += _questions_errors(row.get("questions"), labeled=labeled)
    return errors


def _state_errors(state: Any) -> list[str]:
    if not isinstance(state, dict):
        return ["state 가 객체가 아니다"]
    errors: list[str] = []
    turns = state.get("user_turns")
    if not isinstance(turns, list) or not all(isinstance(t, str) for t in turns):
        errors.append("state.user_turns 가 문자열 배열이 아니다")
    elif len(turns) > 2:
        errors.append("state.user_turns 가 2개를 넘는다")
    reply = state.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        errors.append("state.reply 가 비었거나 문자열이 아니다")
    return errors


def _questions_errors(questions: Any, *, labeled: bool) -> list[str]:
    if not isinstance(questions, dict) or QUESTION_ID not in questions:
        return [f"questions.{QUESTION_ID} 가 없다"]
    q = questions[QUESTION_ID]
    if not isinstance(q, dict):
        return [f"questions.{QUESTION_ID} 가 객체가 아니다"]
    errors: list[str] = []
    if q.get("type") != "choice":
        errors.append("type 이 choice 가 아니다")
    if q.get("instructions") != INSTRUCTIONS:
        errors.append("instructions 가 schema.INSTRUCTIONS 와 다르다")
    if q.get("criteria") != CRITERIA:
        errors.append("criteria 가 schema.CRITERIA 와 다르다")
    label = q.get("label")
    if label in (None, ""):
        if labeled:
            errors.append("label 이 없다")
    elif label not in LABELS:
        errors.append(f"label {label!r} 은 {', '.join(LABELS)} 가 아니다")
    return errors


def label_of(row: dict[str, Any]) -> str | None:
    label = row.get("questions", {}).get(QUESTION_ID, {}).get("label")
    return label or None
