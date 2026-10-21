"""전사가 모자라는 만큼 동반자 답을 합성한다(source "synthetic-haiku").

재료: 인물 파일(dev-tools/chat-eval/personas/*.json)의 지어낸 사용자 말과, 서버의 발화 지시문(reply.rs 에서 읽음).
인물마다 맥락(직전 사용자 말 0~2개)이 모자라면 haiku 에 인물별 지어낸 2턴 맥락을 먼저 받는다. 같은 맥락에
단계(과제)와 지시 변형을 섞어 haiku 에 답을 받는다. 변형 지시는 줄에 남기지 않는다(라벨은 S3·S4 가 붙인다).

    python -m decision.synth --target 600
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import re
import sys
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from decision.candidates import existing, merge
from decision.claude_cli import ClaudeCli, Request
from decision.jsonl import write_jsonl
from decision.paths import CANDIDATES_PATH, PERSONA_DIR, PROJECT_DIR
from decision.schema import make_row
from decision.server_prompt import ReplyPrompt, load_reply_prompt

SOURCE = "synthetic-haiku"
MODEL = "haiku"
SEED = 26
# 맥락 하나를 몇 번까지 다른 단계·변형으로 쓰는가. 인물의 맥락이 몫/이 값보다 적으면 맥락을 더 만든다.
USES_PER_CONTEXT = 4
TURN_PHASES = ("Task", "Deepen", "Retry", "Closing")
VARIANTS: dict[str, str] = {
    "plain": "",
    "generic": "For this reply only: offer general comfort and reassurance that would suit anyone who lost a pet. "
    "Do not pick up the specific details the user mentioned.",
    "reflect": "For this reply only: mainly reflect back, in your own words, the specific facts, names, or memories "
    "the user mentioned.",
    "question": "For this reply only: make a question the main part of the reply.",
}


@dataclass(frozen=True)
class Persona:
    name: str
    situation: str
    language: str
    pet_name: str
    turns: tuple[str, ...]


@dataclass(frozen=True)
class Plan:
    persona: Persona
    context: tuple[str, ...]
    phase: str
    variant: str

    def row_id(self) -> str:
        key = json.dumps([self.context, self.phase, self.variant], ensure_ascii=False)
        return f"synth/{self.persona.name}#{hashlib.sha256(key.encode('utf-8')).hexdigest()[:10]}"


def load_personas(directory: Path = PERSONA_DIR) -> list[Persona]:
    personas = []
    for path in sorted(directory.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        profile = data.get("profile") or {}
        pet = profile.get("petName") or ("your pet" if data["language"] == "en" else "반려동물")
        personas.append(Persona(data["name"], data["situation"], data["language"], pet, tuple(data["turns"])))
    return personas


def base_contexts(persona: Persona) -> list[tuple[str, ...]]:
    """빈 맥락(첫 인사), 첫 말 하나, 이어진 두 말."""
    turns = persona.turns
    contexts: list[tuple[str, ...]] = [(), *([(turns[0],)] if turns else [])]
    contexts += [(turns[i - 1], turns[i]) for i in range(1, len(turns))]
    return contexts


def context_request(persona: Persona, count: int) -> Request:
    language = "Korean" if persona.language == "ko" else "English"
    examples = "\n".join(f"- {t}" for t in persona.turns)
    prompt = (
        "You write test data for a grief-support chat app. The person below is fictional.\n"
        f"Person: {persona.situation}\nPet name: {persona.pet_name}\n"
        f"Things this person has said:\n{examples}\n\n"
        f"Write {count} new, different pairs of two consecutive messages this person might send to a supportive "
        f"companion, in {language}, in the same voice. Vary the topic (memories, daily life, guilt, the last day, "
        "small details). Output only a JSON array of pairs, like [[\"first\", \"second\"], ...]."
    )
    return Request(prompt=prompt, model=MODEL)


def parse_contexts(text: str) -> list[tuple[str, str]]:
    match = re.search(r"\[.*\]", text, re.S)
    if not match:
        raise ValueError("맥락 응답에 JSON 배열이 없다")
    pairs = json.loads(match.group(0))
    return [(a.strip(), b.strip()) for a, b in pairs if isinstance(a, str) and isinstance(b, str) and a and b]


def plans_for(persona: Persona, contexts: Sequence[tuple[str, ...]], quota: int, seed: int = SEED) -> list[Plan]:
    """맥락을 고르게 돌며 단계와 변형을 섞어 quota 개를 고른다."""
    rng = random.Random(f"{seed}:{persona.name}")
    per_context: list[list[Plan]] = []
    for context in contexts:
        phases = ("Intro",) if not context else TURN_PHASES
        options = [Plan(persona, tuple(context), p, v) for p in phases for v in VARIANTS]
        rng.shuffle(options)
        per_context.append(options)
    chosen: list[Plan] = []
    for rank in range(max((len(o) for o in per_context), default=0)):
        for options in per_context:
            if rank < len(options) and len(chosen) < quota:
                chosen.append(options[rank])
    return chosen


def reply_request(plan: Plan, prompt: ReplyPrompt) -> Request:
    persona = plan.persona
    system = prompt.system(phase=plan.phase, pet_name=persona.pet_name, language=persona.language)
    if VARIANTS[plan.variant]:
        system += "\n" + VARIANTS[plan.variant]
    if plan.context:
        history = "\n".join(f"User: {turn}" for turn in plan.context)
        body = f"Conversation so far (the companion's earlier replies are omitted):\n{history}"
    else:
        body = f"User: {prompt.seeds[plan.phase]}"
    return Request(prompt=f"{body}\n\nWrite only the companion's next reply, with nothing before or after it.",
                   model=MODEL, system_prompt=system)


def synthesize(personas: Sequence[Persona], need: int, client: ClaudeCli, prompt: ReplyPrompt) -> list[dict[str, Any]]:
    if need <= 0 or not personas:
        return []
    quota = math.ceil(need / len(personas))
    wanted = math.ceil(quota / USES_PER_CONTEXT)
    contexts = {p.name: base_contexts(p) for p in personas}
    short = [p for p in personas if len(contexts[p.name]) < wanted]
    for persona, answer in zip(short, client.ask_many([context_request(p, wanted) for p in short]), strict=True):
        if isinstance(answer, Exception):
            print(f"{persona.name}: 맥락 생성 실패 ({answer})", file=sys.stderr)
            continue
        try:
            contexts[persona.name] += parse_contexts(answer.text)[: wanted - len(contexts[persona.name])]
        except (ValueError, json.JSONDecodeError) as error:
            print(f"{persona.name}: 맥락 응답을 읽지 못했다 ({error})", file=sys.stderr)
    plans = [plan for p in personas for plan in plans_for(p, contexts[p.name], quota)]
    rows = []
    for plan, answer in zip(plans, client.ask_many([reply_request(plan, prompt) for plan in plans]), strict=True):
        if isinstance(answer, Exception):
            print(f"{plan.row_id()}: 실패 ({answer})", file=sys.stderr)
            continue
        if answer.text:
            rows.append(make_row(plan.row_id(), plan.persona.name, list(plan.context), answer.text, SOURCE))
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="decision.synth")
    parser.add_argument("--target", type=int, default=600, help="후보 파일의 전체 줄 수 목표")
    args = parser.parse_args(argv)
    chat_rows = existing(CANDIDATES_PATH, "chat-eval")
    if not chat_rows:
        print("chat-eval 후보가 없다. 먼저 pnpm decision:label 을 돌린다.", file=sys.stderr)
        return 1
    synth_rows = synthesize(load_personas(), args.target - len(chat_rows), ClaudeCli(), load_reply_prompt())
    rows = merge(chat_rows, synth_rows)
    write_jsonl(CANDIDATES_PATH, rows)
    counts = Counter(row["source"] for row in rows)
    print(f"{CANDIDATES_PATH.relative_to(PROJECT_DIR)}: {len(rows)}줄 ({', '.join(f'{k} {v}' for k, v in counts.items())})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
