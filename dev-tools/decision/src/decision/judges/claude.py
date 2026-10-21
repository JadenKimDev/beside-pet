"""claude 판정기: 이 머신의 Claude Code 를 `claude -p --model <모델>` 로 불러 라벨 하나를 받는다.

claude_cli.ClaudeCli 를 쓴다(구독 세션, 캐시, 병렬 4, Anthropic API 클라이언트 없음). 확률은 주지 않는다.

**SYSTEM_PROMPT 와 USER_PROMPT_TEMPLATE 은 이 판정기의 프롬프트 정본이다. 다음 PRD 의 서버 HaikuJudge 가 같은
문자열(과 render_prompt 의 같은 채우기 규칙)을 쓴다.** 평가 수치가 런타임의 Haiku 와 같다고 보는 전제가 이
문자열이 같다는 것이므로, 고치면 평가를 다시 돌리고 서버 쪽도 함께 고친다.

채우기 규칙(render_prompt):
- {instructions}: 질문의 instructions(schema.INSTRUCTIONS).
- {options}: criteria 를 줄의 차례대로 한 줄에 하나씩 `- <라벨>: <설명>`.
- {user_turns}: 직전 보호자 말을 오래된 것부터 한 줄에 하나씩 `- <말>`(줄바꿈은 공백으로). 없으면 `(없음)`.
- {reply}: 동반자의 답 본문 그대로.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from decision.claude_cli import ClaudeCli, Request, Response
from decision.judges import Judge, Judgment, failed, question_of

SYSTEM_PROMPT = (
    "너는 분류기다. 반려동물을 떠나보낸 보호자와 동반자의 대화에서 동반자의 답(`reply`)이 어떤 성격인지 "
    "주어진 옵션 가운데 하나만 고른다. 답에는 옵션의 이름 하나만 쓴다. 설명, 따옴표, 마침표를 붙이지 않는다."
)

USER_PROMPT_TEMPLATE = """{instructions}

옵션:
{options}

user_turns:
{user_turns}

reply:
{reply}

옵션의 이름 하나만 답하라."""


def _one_line(text: str) -> str:
    return " ".join(text.split())


def render_prompt(state: dict[str, Any], question: dict[str, Any]) -> str:
    options = "\n".join(f"- {label}: {text}" for label, text in question["criteria"].items())
    turns = "\n".join(f"- {_one_line(t)}" for t in state.get("user_turns", [])) or "(없음)"
    return USER_PROMPT_TEMPLATE.format(
        instructions=question["instructions"], options=options, user_turns=turns, reply=state["reply"]
    )


def parse_choice(text: str, labels: Sequence[str]) -> str | None:
    """답에서 라벨 하나를 읽는다. 정확히 라벨 하나면 그것, 본문에 라벨이 하나만 나오면 그것, 아니면 None."""
    cleaned = text.strip().strip("`\"'.。 \n").strip()
    if cleaned in labels:
        return cleaned
    found = {label for label in labels if re.search(rf"(?<![a-z_]){re.escape(label)}(?![a-z_])", text)}
    return found.pop() if len(found) == 1 else None


class ClaudeJudge(Judge):
    name = "claude"

    def __init__(self, model: str = "haiku", client: ClaudeCli | None = None) -> None:
        self.model = model
        self.client = client or ClaudeCli()

    def request(self, row: dict[str, Any]) -> Request:
        return Request(prompt=render_prompt(row["state"], question_of(row)), model=self.model, system_prompt=SYSTEM_PROMPT)

    def _judgment(self, row: dict[str, Any], response: Response | Exception) -> Judgment:
        if isinstance(response, Exception):
            return failed(response)
        labels = list(question_of(row)["criteria"])
        choice = parse_choice(response.text, labels)
        judgment: Judgment = {"choice": choice, "probabilities": None, "latency_ms": response.latency_ms}
        if choice is None:
            judgment["error"] = f"라벨을 읽지 못했다: {response.text[:80]}"
        return judgment

    def judge(self, row: dict[str, Any]) -> Judgment:
        return self._judgment(row, self.client.ask(self.request(row)))

    def judge_many(self, rows: Sequence[dict[str, Any]]) -> list[Judgment]:
        responses = self.client.ask_many([self.request(row) for row in rows])
        return [self._judgment(row, response) for row, response in zip(rows, responses, strict=True)]
