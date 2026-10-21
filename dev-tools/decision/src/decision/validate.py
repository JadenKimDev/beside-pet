"""라벨 JSONL 의 형식 검사. 기본은 라벨 파일(label 필수), --candidates 면 라벨 전 후보 파일.

    python -m decision.validate data/labels/a.jsonl
    python -m decision.validate --candidates data/candidates.jsonl

통과하면 0, 형식 오류가 있으면 1 로 끝난다.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from decision.jsonl import read_jsonl
from decision.schema import row_errors


def file_errors(path: Path, *, labeled: bool) -> list[str]:
    try:
        rows = read_jsonl(path)
    except (OSError, ValueError) as error:
        return [str(error)]
    if not rows:
        return [f"{path}: 줄이 없다"]
    errors: list[str] = []
    seen: set[str] = set()
    for number, row in enumerate(rows, start=1):
        errors += [f"{path}:{number}: {e}" for e in row_errors(row, labeled=labeled)]
        row_id = row.get("id") if isinstance(row, dict) else None
        if isinstance(row_id, str):
            if row_id in seen:
                errors.append(f"{path}:{number}: id {row_id!r} 가 겹친다")
            seen.add(row_id)
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="decision.validate")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--labeled", action="store_true", help="라벨 파일로 검사한다(기본)")
    mode.add_argument("--candidates", action="store_true", help="라벨 전 후보 파일로 검사한다")
    parser.add_argument("files", nargs="+", type=Path)
    args = parser.parse_args(argv)
    labeled = not args.candidates
    failed = False
    for path in args.files:
        errors = file_errors(path, labeled=labeled)
        for error in errors[:50]:
            print(error, file=sys.stderr)
        if len(errors) > 50:
            print(f"... 오류 {len(errors) - 50}개 더", file=sys.stderr)
        failed = failed or bool(errors)
        if not errors:
            print(f"{path}: 통과 ({len(read_jsonl(path))}줄)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
