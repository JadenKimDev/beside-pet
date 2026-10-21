"""라벨 후보 뽑기와 두 라벨의 일치 비교.

    python -m decision.label                       # outputs/chat-eval/**/*.run.json → data/candidates.jsonl
    python -m decision.label --agree A.jsonl B.jsonl  # 일치율, kappa, A 옆에 disagreements.jsonl

재료 경로를 받는 인자는 두지 않는다. 재료는 지어낸 인물의 QA 대화(outputs/chat-eval/)뿐이다.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from decision.agree import compare
from decision.candidates import existing, merge
from decision.jsonl import read_jsonl, write_jsonl
from decision.paths import CANDIDATES_PATH, MATERIAL_DIR, PROJECT_DIR
from decision.extract import extract_candidates
from decision.schema import SOURCES


def write_candidates() -> int:
    if not MATERIAL_DIR.is_dir():
        print(f"재료가 없다: {MATERIAL_DIR}", file=sys.stderr)
        return 1
    # 합성 줄(decision.synth)은 남기고 chat-eval 줄만 다시 뽑는다.
    rows = merge(extract_candidates(MATERIAL_DIR), existing(CANDIDATES_PATH, "synthetic-haiku"))
    count = write_jsonl(CANDIDATES_PATH, rows)
    print(f"{CANDIDATES_PATH.relative_to(PROJECT_DIR)}: {count}줄")
    print_distribution(rows)
    return 0


def print_distribution(rows: list[dict]) -> None:
    counts = Counter((row["persona"], row["source"]) for row in rows)
    for persona in sorted({p for p, _ in counts}):
        parts = ", ".join(f"{source} {counts[persona, source]}" for source in SOURCES if counts[persona, source])
        print(f"  {persona}\t{parts}")


def report_agreement(path_a: Path, path_b: Path) -> int:
    result = compare(read_jsonl(path_a), read_jsonl(path_b))
    out = path_a.parent / "disagreements.jsonl"
    write_jsonl(out, result.disagreements)
    print(f"맞춘 줄\t{result.matched}")
    print(f"일치율\t{result.agreement:.3f}")
    print(f"kappa\t{result.kappa:.3f}")
    print(f"불일치\t{len(result.disagreements)} → {out}")
    for name, ids in (("A 에만", result.only_a), ("B 에만", result.only_b), ("라벨 없음", result.unlabeled)):
        if ids:
            print(f"{name}\t{len(ids)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="decision.label")
    parser.add_argument("--agree", nargs=2, type=Path, metavar=("A", "B"), help="두 라벨 파일을 비교한다")
    args = parser.parse_args(argv)
    if args.agree:
        return report_agreement(*args.agree)
    return write_candidates()


if __name__ == "__main__":
    sys.exit(main())
