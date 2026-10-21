"""인물 단위 학습/평가 분할. 같은 인물의 줄이 양쪽에 들어가지 않게 한다.

규칙: 평가에 chat-eval 출처가 MIN_EVAL_CHAT(30)줄 이상 들어가는 인물의 부분집합 가운데, 출처마다 그 출처
전체의 EVAL_SHARE(20%)에서 떨어진 거리의 합이 가장 작은 것을 평가로 둔다(그런 조합이 없으면 최소 조건 없이).
같은 거리의 조합이 여럿이면 SEED 로 섞은 차례에서 처음 것을 고른다. 모든 인물을 평가로 두지는 않는다.
인물이 16명을 넘으면 SEED 로 섞은 차례대로 거리가 줄어들 때만 더한다. 결과는 data/split.json.

    python -m decision.split
"""

from __future__ import annotations

import itertools
import json
import random
import sys
from collections.abc import Sequence
from pathlib import Path

from decision.jsonl import read_jsonl
from decision.paths import CANDIDATES_PATH, PROJECT_DIR, SPLIT_PATH

EVAL_SHARE = 0.2
SEED = 26
# 평가셋에 들어가야 하는 chat-eval 출처의 최소 줄 수(실제 서버가 낸 답으로 재는 몫).
MIN_EVAL_CHAT = 30
# 인물이 이보다 많으면 모든 조합을 보지 않고 섞은 차례로 채운다.
MAX_EXHAUSTIVE = 16

# 인물 → 출처 → 줄 수
Counts = dict[str, dict[str, int]]


def _sum(counts: Counts, personas: Sequence[str], source: str | None = None) -> int:
    return sum(n for p in personas for s, n in counts[p].items() if source in (None, s))


def _score(counts: Counts, combo: Sequence[str], share: float) -> float:
    """출처마다 목표(그 출처 전체의 share)에서 떨어진 거리의 합. 두 출처가 함께 비례할수록 작다."""
    sources = {s for c in counts.values() for s in c}
    return sum(abs(_sum(counts, combo, s) - share * _sum(counts, list(counts), s)) for s in sources)


def choose_eval(counts: Counts, share: float = EVAL_SHARE, seed: int = SEED, min_chat: int = MIN_EVAL_CHAT) -> list[str]:
    personas = sorted(counts)
    if len(personas) < 2:
        raise ValueError("인물이 둘 이상이어야 나눌 수 있다")
    if len(personas) > MAX_EXHAUSTIVE:
        return _greedy(counts, share, seed)
    combos = [c for k in range(1, len(personas)) for c in itertools.combinations(personas, k)]
    random.Random(seed).shuffle(combos)
    enough = [c for c in combos if _sum(counts, c, "chat-eval") >= min_chat] or combos
    return sorted(min(enough, key=lambda c: _score(counts, c, share)))


def _greedy(counts: Counts, share: float, seed: int) -> list[str]:
    order = sorted(counts)
    random.Random(seed).shuffle(order)
    chosen: list[str] = []
    for persona in order:
        if len(chosen) < len(order) - 1 and _score(counts, [*chosen, persona], share) < _score(counts, chosen, share):
            chosen.append(persona)
    return sorted(chosen or order[:1])


def split(counts: Counts) -> dict[str, list[str]]:
    eval_personas = choose_eval(counts)
    return {
        "train_personas": sorted(p for p in counts if p not in eval_personas),
        "eval_personas": eval_personas,
    }


def count_rows(rows: Sequence[dict]) -> Counts:
    counts: Counts = {}
    for row in rows:
        by_source = counts.setdefault(row["persona"], {})
        by_source[row["source"]] = by_source.get(row["source"], 0) + 1
    return counts


def main(argv: list[str] | None = None) -> int:
    del argv
    counts = count_rows(read_jsonl(CANDIDATES_PATH))
    result = split(counts)
    write_split(SPLIT_PATH, result)
    for name, key in (("학습", "train_personas"), ("평가", "eval_personas")):
        personas = result[key]
        detail = ", ".join(f"{s} {_sum(counts, personas, s)}" for s in sorted({s for c in counts.values() for s in c}))
        print(f"{name} {_sum(counts, personas)}줄 ({detail})")
    print(f"{SPLIT_PATH.relative_to(PROJECT_DIR)}")
    print(f"  평가 인물: {', '.join(result['eval_personas'])}")
    return 0


def write_split(path: Path, result: dict[str, list[str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(format_split(result), encoding="utf-8")


def format_split(result: dict[str, list[str]], width: int = 120) -> str:
    """레포의 biome 형식과 같게 쓴다: 한 줄에 들어가는 배열은 한 줄로, 넘치면 한 항목씩."""
    entries = []
    for key, values in result.items():
        line = f"  {json.dumps(key)}: {json.dumps(values, ensure_ascii=False)}"
        if len(line) > width:
            items = ",\n".join(f"    {json.dumps(v, ensure_ascii=False)}" for v in values)
            line = f"  {json.dumps(key)}: [\n{items}\n  ]"
        entries.append(line)
    return "{\n" + ",\n".join(entries) + "\n}\n"


if __name__ == "__main__":
    sys.exit(main())
