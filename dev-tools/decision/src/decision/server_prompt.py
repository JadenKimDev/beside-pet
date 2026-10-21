"""서버의 발화 지시문을 apps/server/src/support/prompt/reply.rs 에서 읽어 낸다(읽기만 한다).

문자열을 복사해 두지 않고 파일에서 뽑으므로, 서버가 문구를 바꾸면 합성도 같은 문구를 쓴다. 파일의 모양이
바뀌어 뽑지 못하면 조용히 넘어가지 않고 실패한다. 재개(Resume) 블록과 근거 지식 블록은 합성에 쓰지 않는다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from decision.paths import REPLY_PROMPT_PATH

_LITERAL = r'"((?:[^"\\]|\\.)*)"'
# apps/server/src/support/prompt/language.rs 의 output_language 와 같다.
OUTPUT_LANGUAGE = {"ko": "Korean", "en": "English"}


@dataclass(frozen=True)
class ReplyPrompt:
    lines: tuple[str, ...]  # 시스템 프롬프트의 줄. 자리 표시자 {} 가 남아 있다.
    guides: dict[str, str]  # 단계 → 지침
    seeds: dict[str, str]  # 단계 → 모델이 먼저 말할 때의 사용자 씨앗

    def system(self, *, phase: str, pet_name: str, language: str) -> str:
        out = []
        for line in self.lines:
            if "Respond ONLY in" in line:
                line = line.replace("{}", pet_name, 1).replace("{}", OUTPUT_LANGUAGE[language], 1)
            elif "phase guidance" in line:
                line = line.replace("{}", self.guides[phase], 1)
            out.append(line)
        return "\n".join(out)


def _unescape(literal: str) -> str:
    return re.sub(r"\\(.)", lambda m: {"n": "\n", "t": "\t"}.get(m.group(1), m.group(1)), literal)


def _fn_body(source: str, name: str) -> str:
    match = re.search(rf"fn {name}\b.*?\n\}}\n", source, re.S)
    if not match:
        raise ValueError(f"reply.rs 에서 fn {name} 을 찾지 못했다")
    return match.group(0)


def _phase_table(source: str, name: str) -> dict[str, str]:
    table = {m.group(1): _unescape(m.group(2)) for m in re.finditer(
        rf"ReplyPhase::(\w+)\s*=>\s*\{{?\s*{_LITERAL}", _fn_body(source, name))}
    if not table:
        raise ValueError(f"reply.rs 의 fn {name} 에서 단계 문구를 찾지 못했다")
    return table


def parse_reply_prompt(source: str) -> ReplyPrompt:
    body = _fn_body(source, "reply_system_prompt")
    block = re.search(r"let lines = \[(.*?)\];", body, re.S)
    if not block:
        raise ValueError("reply.rs 의 reply_system_prompt 에서 lines 를 찾지 못했다")
    lines = []
    for literal in (_unescape(m.group(1)) for m in re.finditer(_LITERAL, block.group(1))):
        if "{grounding}" in literal:
            continue
        if "{" in literal and "Respond ONLY in" not in literal and "phase guidance" not in literal:
            raise ValueError(f"reply.rs 의 모르는 자리 표시자: {literal[:60]}")
        lines.append(literal)
    if not any("phase guidance" in line for line in lines):
        raise ValueError("reply.rs 에서 단계 지침 줄을 찾지 못했다")
    return ReplyPrompt(tuple(lines), _phase_table(source, "phase_guide"), _phase_table(source, "phase_seed"))


def load_reply_prompt(path: Path = REPLY_PROMPT_PATH) -> ReplyPrompt:
    return parse_reply_prompt(path.read_text(encoding="utf-8"))
